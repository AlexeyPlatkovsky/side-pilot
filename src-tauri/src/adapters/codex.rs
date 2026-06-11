//! OpenAI Codex adapter.
//!
//! Drives `codex exec` in non-interactive, read-only, blocking mode and parses
//! its JSONL event stream into a typed [`AdapterResult`]. See the CLI
//! Invocation Contract (`docs/idea.md` §1–§9). Verified against `codex-cli`
//! 0.128.0, whose `--json` stream emits one JSON object per line, e.g.:
//!
//! ```text
//! {"type":"thread.started","thread_id":"<uuid>"}
//! {"type":"turn.started"}
//! {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"pong"}}
//! {"type":"turn.completed","usage":{"input_tokens":18982,...}}
//! ```

use std::sync::Arc;
#[cfg(test)]
use std::path::PathBuf;

use async_trait::async_trait;
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

use super::ansi::strip_ansi;
use super::binary::BinaryResolver;
use super::contract::{AdapterRequest, AdapterResult, PermissionMode, Usage};
use super::environment::EnvironmentProvider;
use super::error::AdapterError;
use super::process::{CommandRunner, RunOutcome};
use super::shared::AdapterBase;
use super::{AssistantId, CliAdapter};

/// Adapter that runs the OpenAI Codex CLI.
pub struct CodexAdapter {
    base: AdapterBase,
}

impl CodexAdapter {
    /// Build a Codex adapter from a binary resolver and command runner. The
    /// neutral working directory defaults to the OS temp directory (never the
    /// app bundle, §3).
    pub fn new(
        resolver: Arc<dyn BinaryResolver>,
        runner: Arc<dyn CommandRunner>,
        env_provider: Arc<dyn EnvironmentProvider>,
    ) -> Self {
        Self {
            base: AdapterBase::new(resolver, runner, env_provider),
        }
    }

    /// Override the neutral working directory (tests use this for determinism).
    #[cfg(test)]
    fn with_neutral_cwd(mut self, cwd: PathBuf) -> Self {
        self.base = self.base.with_neutral_cwd(cwd);
        self
    }

    /// Construct the `codex exec` argument vector for a request.
    ///
    /// Fresh runs pass the full read-only sandbox + working-root flags. Resume
    /// runs (`codex exec resume <id>`) cannot take `-s`/`-C` (unsupported by the
    /// subcommand in codex-cli 0.128.0); they inherit the originating session's
    /// read-only posture and take the working directory via the process `cwd`.
    fn build_args(req: &AdapterRequest, cwd: &str) -> Vec<String> {
        let mut args: Vec<String> = vec!["exec".to_string()];

        let resuming = req.resume_session_id.is_some();
        if let Some(session_id) = &req.resume_session_id {
            args.push("resume".to_string());
            args.push(session_id.clone());
        }

        args.push("--json".to_string());
        args.push("--skip-git-repo-check".to_string());

        // Model and reasoning effort are applied on fresh runs only. A resumed
        // session (`codex exec resume`) inherits the model/effort/posture of its
        // originating session, so re-specifying them is unnecessary and the
        // subcommand may reject the flags (verified constraint, §6).
        if !resuming {
            let PermissionMode::ReadOnly = req.permission_mode;
            args.push("-s".to_string());
            args.push("read-only".to_string());

            if let Some(model) = &req.model {
                args.push("-m".to_string());
                args.push(model.clone());
            }

            if let Some(effort) = &req.reasoning_effort {
                args.push("-c".to_string());
                args.push(format!("model_reasoning_effort=\"{effort}\""));
            }

            args.push("-C".to_string());
            args.push(cwd.to_string());
        }

        args.push(req.prompt.clone());
        args
    }
}

#[async_trait]
impl CliAdapter for CodexAdapter {
    fn id(&self) -> AssistantId {
        AssistantId::Codex
    }

    async fn run(
        &self,
        req: AdapterRequest,
        cancel: CancellationToken,
    ) -> Result<AdapterResult, AdapterError> {
        let cwd = self.base.resolve_cwd(&req);
        let args = Self::build_args(&req, &cwd.to_string_lossy());
        let outcome = self.base.dispatch(AssistantId::Codex, args, cwd, &req, cancel).await?;

        match outcome {
            RunOutcome::TimedOut => Err(AdapterError::TimedOut),
            RunOutcome::Cancelled => Err(AdapterError::Cancelled),
            RunOutcome::Completed {
                exit_code,
                stdout,
                stderr,
            } => {
                if exit_code != Some(0) {
                    return Err(classify_exit(exit_code, &stderr));
                }
                let parsed = parse_codex_output(&stdout)?;
                Ok(AdapterResult {
                    assistant_text: parsed.assistant_text,
                    raw_json: stdout,
                    native_session_id: parsed.session_id,
                    usage: parsed.usage,
                })
            }
        }
    }
}

/// Map a non-zero/failed exit onto the error taxonomy (§8). Auth failures are
/// recognized from stderr markers; everything else is a generic non-zero exit.
fn classify_exit(code: Option<i32>, stderr: &str) -> AdapterError {
    let lower = stderr.to_ascii_lowercase();
    const AUTH_MARKERS: [&str; 5] = [
        "not logged in",
        "unauthorized",
        "authentication",
        "logged out",
        "please run \"codex login\"",
    ];
    if AUTH_MARKERS.iter().any(|m| lower.contains(m)) {
        AdapterError::NotAuthenticated
    } else {
        AdapterError::NonZeroExit {
            code,
            stderr: stderr.to_string(),
        }
    }
}

/// Parsed pieces of a successful Codex JSONL stream.
#[derive(Debug)]
struct ParsedCodex {
    assistant_text: String,
    session_id: Option<String>,
    usage: Option<Usage>,
}

/// Codex reports token usage in snake_case; deserialize into this local shape
/// before mapping onto the camelCase IPC [`Usage`].
#[derive(Deserialize)]
struct CodexUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    cached_input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    reasoning_output_tokens: u64,
}

impl From<CodexUsage> for Usage {
    fn from(u: CodexUsage) -> Self {
        Usage {
            input_tokens: u.input_tokens,
            cached_input_tokens: u.cached_input_tokens,
            output_tokens: u.output_tokens,
            reasoning_output_tokens: u.reasoning_output_tokens,
        }
    }
}

/// Parse the Codex `--json` JSONL stream. Tolerant of non-JSON/garbage lines;
/// the final `agent_message` is the assistant text. Missing it is a parse
/// failure (§5).
fn parse_codex_output(stdout: &str) -> Result<ParsedCodex, AdapterError> {
    let mut session_id = None;
    let mut assistant_text: Option<String> = None;
    let mut usage = None;

    for line in stdout.lines() {
        let stripped = strip_ansi(line);
        let trimmed = stripped.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(value) => value,
            Err(_) => continue,
        };

        match value.get("type").and_then(serde_json::Value::as_str) {
            Some("thread.started") => {
                session_id = value
                    .get("thread_id")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
            }
            Some("item.completed") => {
                if let Some(item) = value.get("item") {
                    if item.get("type").and_then(serde_json::Value::as_str) == Some("agent_message")
                    {
                        if let Some(text) = item.get("text").and_then(serde_json::Value::as_str) {
                            // Last agent_message wins — it is the final answer.
                            assistant_text = Some(text.to_string());
                        }
                    }
                }
            }
            Some("turn.completed") => {
                if let Some(raw) = value.get("usage") {
                    usage = serde_json::from_value::<CodexUsage>(raw.clone())
                        .ok()
                        .map(Usage::from);
                }
            }
            _ => {}
        }
    }

    match assistant_text {
        Some(assistant_text) => Ok(ParsedCodex {
            assistant_text,
            session_id,
            usage,
        }),
        None => Err(AdapterError::OutputParseFailure {
            detail: "no agent_message event in codex output".to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::binary::MockBinaryResolver;
    use crate::adapters::environment::MockEnvironmentProvider;
    use crate::adapters::process::MockCommandRunner;

    const FIXTURE: &str = concat!(
        r#"{"type":"thread.started","thread_id":"019e90c6-f120-7822-b2c3-cae55a5f3bfa"}"#,
        "\n",
        r#"{"type":"turn.started"}"#,
        "\n",
        r#"{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"pong"}}"#,
        "\n",
        r#"{"type":"turn.completed","usage":{"input_tokens":18982,"cached_input_tokens":2432,"output_tokens":19,"reasoning_output_tokens":12}}"#,
    );

    fn request(prompt: &str) -> AdapterRequest {
        AdapterRequest {
            assistant: AssistantId::Codex,
            prompt: prompt.to_string(),
            working_directory: None,
            model: None,
            reasoning_effort: None,
            permission_mode: PermissionMode::ReadOnly,
            timeout_ms: 120_000,
            resume_session_id: None,
            run_id: None,
            custom_command: None,
        }
    }

    // ---- Argument construction ----------------------------------------------

    #[test]
    fn build_args_fresh_run_uses_readonly_sandbox_and_working_root() {
        let args = CodexAdapter::build_args(&request("hello"), "/work");
        assert_eq!(
            args,
            vec![
                "exec",
                "--json",
                "--skip-git-repo-check",
                "-s",
                "read-only",
                "-C",
                "/work",
                "hello",
            ]
        );
    }

    #[test]
    fn build_args_includes_model_when_present() {
        let mut req = request("hi");
        req.model = Some("gpt-5".to_string());
        let args = CodexAdapter::build_args(&req, "/work");
        let model_pos = args.iter().position(|a| a == "-m").expect("has -m");
        assert_eq!(args[model_pos + 1], "gpt-5");
    }

    #[test]
    fn build_args_fresh_run_includes_reasoning_effort_when_present() {
        let mut req = request("hi");
        req.reasoning_effort = Some("medium".to_string());
        let args = CodexAdapter::build_args(&req, "/work");
        let cfg_pos = args.iter().position(|a| a == "-c").expect("has -c");
        assert_eq!(args[cfg_pos + 1], "model_reasoning_effort=\"medium\"");
    }

    #[test]
    fn build_args_resume_omits_model_and_reasoning_effort() {
        let mut req = request("again");
        req.resume_session_id = Some("sid-123".to_string());
        req.model = Some("gpt-5".to_string());
        req.reasoning_effort = Some("high".to_string());
        let args = CodexAdapter::build_args(&req, "/work");
        // A resumed session inherits model/effort; the flags must not appear.
        assert!(!args.contains(&"-m".to_string()), "resume must not set -m");
        assert!(!args.contains(&"-c".to_string()), "resume must not set -c");
    }

    #[test]
    fn build_args_resume_omits_sandbox_and_cd_and_carries_session_id() {
        let mut req = request("again");
        req.resume_session_id = Some("sid-123".to_string());
        let args = CodexAdapter::build_args(&req, "/work");
        assert_eq!(
            args,
            vec![
                "exec",
                "resume",
                "sid-123",
                "--json",
                "--skip-git-repo-check",
                "again",
            ]
        );
        assert!(!args.contains(&"-s".to_string()), "resume must not set -s");
        assert!(!args.contains(&"-C".to_string()), "resume must not set -C");
    }

    // ---- Output parsing ------------------------------------------------------

    #[test]
    fn parses_assistant_text_session_id_and_usage() {
        let parsed = parse_codex_output(FIXTURE).unwrap();
        assert_eq!(parsed.assistant_text, "pong");
        assert_eq!(
            parsed.session_id.as_deref(),
            Some("019e90c6-f120-7822-b2c3-cae55a5f3bfa")
        );
        let usage = parsed.usage.unwrap();
        assert_eq!(usage.input_tokens, 18982);
        assert_eq!(usage.cached_input_tokens, 2432);
        assert_eq!(usage.output_tokens, 19);
        assert_eq!(usage.reasoning_output_tokens, 12);
    }

    #[test]
    fn parse_ignores_garbage_lines_and_strips_ansi() {
        let noisy = format!(
            "Reading additional input...\n\u{1b}[2m{}\u{1b}[0m\nnot json at all",
            r#"{"type":"item.completed","item":{"type":"agent_message","text":"hi"}}"#
        );
        let parsed = parse_codex_output(&noisy).unwrap();
        assert_eq!(parsed.assistant_text, "hi");
    }

    #[test]
    fn parse_strips_osc_wrapped_json_line() {
        // A terminal wrapper prefixes an OSC title-set escape and suffixes a
        // CSI reset around the agent_message JSON. Both must be stripped so the
        // event still parses.
        let noisy = format!(
            "\u{1b}]0;codex\u{07}{}\u{1b}[0m",
            r#"{"type":"item.completed","item":{"type":"agent_message","text":"hi"}}"#
        );
        let parsed = parse_codex_output(&noisy).unwrap();
        assert_eq!(parsed.assistant_text, "hi");
    }

    #[test]
    fn parse_with_ansi_wrapping_keeps_session_and_usage() {
        // Wrap every fixture line in CSI + OSC noise; session id and usage must
        // still be recovered alongside the assistant text.
        let wrapped = FIXTURE
            .lines()
            .map(|l| format!("\u{1b}]0;t\u{07}\u{1b}[36m{l}\u{1b}[0m"))
            .collect::<Vec<_>>()
            .join("\n");
        let parsed = parse_codex_output(&wrapped).unwrap();
        assert_eq!(parsed.assistant_text, "pong");
        assert_eq!(
            parsed.session_id.as_deref(),
            Some("019e90c6-f120-7822-b2c3-cae55a5f3bfa")
        );
        assert_eq!(parsed.usage.unwrap().output_tokens, 19);
    }

    #[test]
    fn parse_missing_agent_message_is_parse_failure() {
        let no_message = r#"{"type":"thread.started","thread_id":"x"}
{"type":"turn.completed","usage":{"input_tokens":1}}"#;
        let err = parse_codex_output(no_message).unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    // ---- Error classification ------------------------------------------------

    #[test]
    fn classify_exit_detects_auth_failure() {
        let err = classify_exit(Some(1), "Error: you are not logged in. Run codex login");
        assert_eq!(err, AdapterError::NotAuthenticated);
    }

    #[test]
    fn classify_exit_defaults_to_non_zero_exit() {
        let err = classify_exit(Some(2), "some other failure");
        assert_eq!(
            err,
            AdapterError::NonZeroExit {
                code: Some(2),
                stderr: "some other failure".to_string(),
            }
        );
    }

    // ---- End-to-end run() with mocked runner + resolver ----------------------

    fn env_ok() -> MockEnvironmentProvider {
        let mut env = MockEnvironmentProvider::new();
        env.expect_environment()
            .returning(|_| Ok(vec![("CODEX_HOME".to_string(), "/tmp/codex".to_string())]));
        env
    }

    fn adapter_with(runner: MockCommandRunner, resolver: MockBinaryResolver) -> CodexAdapter {
        CodexAdapter::new(Arc::new(resolver), Arc::new(runner), Arc::new(env_ok()))
            .with_neutral_cwd(PathBuf::from("/neutral"))
    }

    fn resolver_ok() -> MockBinaryResolver {
        let mut resolver = MockBinaryResolver::new();
        resolver
            .expect_resolve()
            .returning(|_| Ok(PathBuf::from("/abs/codex")));
        resolver
    }

    #[tokio::test]
    async fn run_happy_path_returns_parsed_result_and_builds_expected_command() {
        let mut runner = MockCommandRunner::new();
        runner
            .expect_run()
            .withf(|spec| {
                spec.program == std::path::Path::new("/abs/codex")
                    && spec.cwd == std::path::Path::new("/neutral")
                    && spec.args
                        == vec![
                            "exec",
                            "--json",
                            "--skip-git-repo-check",
                            "-s",
                            "read-only",
                            "-C",
                            "/neutral",
                            "ping",
                        ]
                    && spec.stdin.is_none()
                    && spec.env == vec![("CODEX_HOME".to_string(), "/tmp/codex".to_string())]
            })
            .returning(|_| {
                Ok(RunOutcome::Completed {
                    exit_code: Some(0),
                    stdout: FIXTURE.to_string(),
                    stderr: String::new(),
                })
            });

        let adapter = adapter_with(runner, resolver_ok());
        let result = adapter
            .run(request("ping"), CancellationToken::new())
            .await
            .unwrap();

        assert_eq!(result.assistant_text, "pong");
        assert_eq!(
            result.native_session_id.as_deref(),
            Some("019e90c6-f120-7822-b2c3-cae55a5f3bfa")
        );
        assert_eq!(result.usage.unwrap().output_tokens, 19);
    }

    #[tokio::test]
    async fn run_maps_binary_resolution_failure() {
        let mut resolver = MockBinaryResolver::new();
        resolver
            .expect_resolve()
            .returning(|_| Err(AdapterError::BinaryNotFound));
        // Runner must never be called when resolution fails.
        let runner = MockCommandRunner::new();

        let adapter = adapter_with(runner, resolver);
        let err = adapter
            .run(request("hi"), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::BinaryNotFound);
    }

    #[tokio::test]
    async fn run_maps_spawn_failure_to_binary_not_found() {
        let mut runner = MockCommandRunner::new();
        runner
            .expect_run()
            .returning(|_| Err(std::io::Error::new(std::io::ErrorKind::NotFound, "gone")));

        let adapter = adapter_with(runner, resolver_ok());
        let err = adapter
            .run(request("hi"), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::BinaryNotFound);
    }

    #[tokio::test]
    async fn run_maps_non_not_found_runner_io_failure_to_non_zero_exit() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| {
            Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "cwd denied",
            ))
        });

        let adapter = adapter_with(runner, resolver_ok());
        let err = adapter
            .run(request("hi"), CancellationToken::new())
            .await
            .unwrap_err();

        assert!(matches!(
            err,
            AdapterError::NonZeroExit {
                code: None,
                stderr
            } if stderr.contains("cwd denied")
        ));
    }

    #[tokio::test]
    async fn run_maps_non_zero_exit() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| {
            Ok(RunOutcome::Completed {
                exit_code: Some(3),
                stdout: String::new(),
                stderr: "boom".to_string(),
            })
        });

        let adapter = adapter_with(runner, resolver_ok());
        let err = adapter
            .run(request("hi"), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(
            err,
            AdapterError::NonZeroExit {
                code: Some(3),
                stderr: "boom".to_string()
            }
        );
    }

    #[tokio::test]
    async fn run_maps_auth_failure() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| {
            Ok(RunOutcome::Completed {
                exit_code: Some(1),
                stdout: String::new(),
                stderr: "You are not logged in".to_string(),
            })
        });

        let adapter = adapter_with(runner, resolver_ok());
        let err = adapter
            .run(request("hi"), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::NotAuthenticated);
    }

    #[tokio::test]
    async fn run_maps_timeout_outcome() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| Ok(RunOutcome::TimedOut));

        let adapter = adapter_with(runner, resolver_ok());
        let err = adapter
            .run(request("hi"), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::TimedOut);
    }

    #[tokio::test]
    async fn run_maps_cancelled_outcome() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| Ok(RunOutcome::Cancelled));

        let adapter = adapter_with(runner, resolver_ok());
        let err = adapter
            .run(request("hi"), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::Cancelled);
    }

    #[tokio::test]
    async fn run_maps_unparseable_success_to_parse_failure() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| {
            Ok(RunOutcome::Completed {
                exit_code: Some(0),
                stdout: "no events here".to_string(),
                stderr: String::new(),
            })
        });

        let adapter = adapter_with(runner, resolver_ok());
        let err = adapter
            .run(request("hi"), CancellationToken::new())
            .await
            .unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }
}
