//! Claude Code adapter.
//!
//! Drives `claude -p` in non-interactive, read-only, blocking mode and parses
//! its `--output-format json` result into a typed [`AdapterResult`]. See the CLI
//! Invocation Contract (`docs/idea.md` §1–§9). Verified against Claude Code
//! 2.1.161, whose `--output-format json` emits a single JSON **array** of
//! events; the final `{"type":"result",…}` element carries the assistant text
//! (`result`), the `session_id`, and `usage`, e.g.:
//!
//! ```text
//! [
//!   {"type":"system","subtype":"init","session_id":"<uuid>", …},
//!   {"type":"assistant","message":{"content":[{"type":"text","text":"pong"}]}, …},
//!   {"type":"result","subtype":"success","is_error":false,"result":"pong",
//!    "session_id":"<uuid>","usage":{"input_tokens":7,"cache_read_input_tokens":50087,
//!    "output_tokens":523}}
//! ]
//! ```
//!
//! Older/other builds may emit the bare `{"type":"result",…}` object instead of
//! an array; the parser accepts both shapes (§5).

use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{Map, Value};
use tokio_util::sync::CancellationToken;

use super::binary::BinaryResolver;
use super::contract::{AdapterRequest, AdapterResult, PermissionMode, Usage};
use super::environment::EnvironmentProvider;
use super::error::AdapterError;
use super::json::parse_json_lenient;
use super::process::{CommandRunner, CommandSpec, RunOutcome};
use super::{AssistantId, CliAdapter};

/// Adapter that runs the Claude Code CLI.
pub struct ClaudeAdapter {
    resolver: Arc<dyn BinaryResolver>,
    runner: Arc<dyn CommandRunner>,
    env_provider: Arc<dyn EnvironmentProvider>,
    /// Neutral working directory used when a request carries no workspace (§3).
    neutral_cwd: PathBuf,
}

impl ClaudeAdapter {
    /// Build a Claude adapter from a binary resolver, command runner, and
    /// environment provider. The neutral working directory defaults to the OS
    /// temp directory (never the app bundle, §3).
    pub fn new(
        resolver: Arc<dyn BinaryResolver>,
        runner: Arc<dyn CommandRunner>,
        env_provider: Arc<dyn EnvironmentProvider>,
    ) -> Self {
        Self {
            resolver,
            runner,
            env_provider,
            neutral_cwd: std::env::temp_dir(),
        }
    }

    /// Override the neutral working directory (tests use this for determinism).
    #[cfg(test)]
    fn with_neutral_cwd(mut self, cwd: PathBuf) -> Self {
        self.neutral_cwd = cwd;
        self
    }

    /// The working directory for this request: the requested workspace, or the
    /// neutral app-controlled directory when none is supplied (§3, MVP). Claude
    /// inherits its file-access root from the process `cwd` (§1), so no `-C`/
    /// `--add-dir` flag is needed for the MVP read-only posture.
    fn resolve_cwd(&self, req: &AdapterRequest) -> PathBuf {
        req.working_directory
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| self.neutral_cwd.clone())
    }

    /// Construct the `claude -p` argument vector for a request.
    ///
    /// The read-only `plan` permission posture is always enforced (§4) —
    /// including on resume — so the conservative default cannot be lost across
    /// turns. Model selection applies on fresh runs only; a resumed session
    /// (`-r <id>`) inherits the model of its originating session (§6). Reasoning
    /// effort is passed through using Claude's `--effort` option. The prompt is
    /// the final positional argument; Claude's `-p/--print` is a boolean flag.
    fn build_args(req: &AdapterRequest) -> Vec<String> {
        let mut args: Vec<String> = vec![
            "-p".to_string(),
            "--output-format".to_string(),
            "json".to_string(),
        ];

        // Read-only posture, always enforced (§4): Claude `plan` mode.
        let PermissionMode::ReadOnly = req.permission_mode;
        args.push("--permission-mode".to_string());
        args.push("plan".to_string());

        if let Some(session_id) = &req.resume_session_id {
            args.push("-r".to_string());
            args.push(session_id.clone());
        } else if let Some(model) = &req.model {
            args.push("--model".to_string());
            args.push(model.clone());
        }
        if let Some(effort) = &req.reasoning_effort {
            args.push("--effort".to_string());
            args.push(effort.clone());
        }

        args.push(req.prompt.clone());
        args
    }
}

#[async_trait]
impl CliAdapter for ClaudeAdapter {
    fn id(&self) -> AssistantId {
        AssistantId::Claude
    }

    async fn run(
        &self,
        req: AdapterRequest,
        cancel: CancellationToken,
    ) -> Result<AdapterResult, AdapterError> {
        let program = self.resolver.resolve(AssistantId::Claude).await?;
        let env = self.env_provider.environment(AssistantId::Claude).await?;
        let cwd = self.resolve_cwd(&req);
        let args = Self::build_args(&req);

        let spec = CommandSpec {
            program,
            args,
            cwd,
            env,
            stdin: None,
            timeout: req.timeout(),
            cancel,
        };

        let outcome = self.runner.run(spec).await.map_err(map_runner_io_error)?;

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
                let parsed = parse_claude_output(&stdout)?;
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

fn map_runner_io_error(err: std::io::Error) -> AdapterError {
    if err.kind() == std::io::ErrorKind::NotFound {
        AdapterError::BinaryNotFound
    } else {
        AdapterError::NonZeroExit {
            code: None,
            stderr: err.to_string(),
        }
    }
}

/// Map a non-zero/failed exit onto the error taxonomy (§8). Auth failures are
/// recognized from stderr markers; everything else is a generic non-zero exit.
fn classify_exit(code: Option<i32>, stderr: &str) -> AdapterError {
    if is_auth_failure(stderr) {
        AdapterError::NotAuthenticated
    } else {
        AdapterError::NonZeroExit {
            code,
            stderr: stderr.to_string(),
        }
    }
}

/// Parsed pieces of a successful Claude result event.
#[derive(Debug)]
struct ParsedClaude {
    assistant_text: String,
    session_id: Option<String>,
    usage: Option<Usage>,
}

/// Claude reports token usage with distinct cache fields; deserialize into this
/// local shape before mapping onto the camelCase IPC [`Usage`].
#[derive(Deserialize)]
struct ClaudeUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    cache_read_input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
}

impl From<ClaudeUsage> for Usage {
    fn from(u: ClaudeUsage) -> Self {
        Usage {
            input_tokens: u.input_tokens,
            cached_input_tokens: u.cache_read_input_tokens,
            output_tokens: u.output_tokens,
            // Claude does not separate reasoning tokens in `--output-format json`.
            reasoning_output_tokens: 0,
        }
    }
}

/// Parse Claude's `--output-format json` output into the typed result (§5).
///
/// Claude 2.1.161 emits a JSON array of events; older/other builds may emit the
/// bare `{"type":"result",…}` object. Both shapes are accepted. The `result`
/// event's `is_error` flag is honored: an in-band failure maps onto the error
/// taxonomy rather than being surfaced as assistant text.
fn parse_claude_output(stdout: &str) -> Result<ParsedClaude, AdapterError> {
    let value = parse_json_lenient(stdout)?;
    let result_obj =
        find_result_object(&value).ok_or_else(|| AdapterError::OutputParseFailure {
            detail: "no result event in claude output".to_string(),
        })?;

    if result_obj.get("is_error").and_then(Value::as_bool) == Some(true) {
        let detail = result_obj
            .get("result")
            .and_then(Value::as_str)
            .unwrap_or("claude reported an error")
            .to_string();
        return Err(classify_error_text(detail));
    }

    let assistant_text = result_obj
        .get("result")
        .and_then(Value::as_str)
        .ok_or_else(|| AdapterError::OutputParseFailure {
            detail: "claude result event has no result text".to_string(),
        })?
        .to_string();

    let session_id = result_obj
        .get("session_id")
        .and_then(Value::as_str)
        .map(str::to_string);

    let usage = result_obj
        .get("usage")
        .and_then(|raw| serde_json::from_value::<ClaudeUsage>(raw.clone()).ok())
        .map(Usage::from);

    Ok(ParsedClaude {
        assistant_text,
        session_id,
        usage,
    })
}

/// Locate the `{"type":"result",…}` event in either an array of events or a
/// bare object. When several result events appear, the last one wins.
fn find_result_object(value: &Value) -> Option<&Map<String, Value>> {
    match value {
        Value::Array(items) => items.iter().rev().find_map(as_result_object),
        other => as_result_object(other),
    }
}

fn as_result_object(value: &Value) -> Option<&Map<String, Value>> {
    value
        .as_object()
        .filter(|map| map.get("type").and_then(Value::as_str) == Some("result"))
}

/// Map an in-band error message onto the taxonomy: auth markers become
/// [`AdapterError::NotAuthenticated`]; anything else is a non-zero exit (§8).
fn classify_error_text(text: String) -> AdapterError {
    if is_auth_failure(&text) {
        AdapterError::NotAuthenticated
    } else {
        AdapterError::NonZeroExit {
            code: None,
            stderr: text,
        }
    }
}

/// Recognize Claude authentication/login failures from CLI text (§8).
fn is_auth_failure(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    const AUTH_MARKERS: [&str; 7] = [
        "invalid api key",
        "not logged in",
        "please run /login",
        "/login",
        "unauthorized",
        "authentication",
        "oauth token has expired",
    ];
    AUTH_MARKERS.iter().any(|m| lower.contains(m))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::binary::MockBinaryResolver;
    use crate::adapters::environment::MockEnvironmentProvider;
    use crate::adapters::process::MockCommandRunner;

    const FIXTURE: &str = concat!(
        "[",
        r#"{"type":"system","subtype":"init","session_id":"a8fc44db-5540-46ef-9c7f-7ca5b17fd4c6","model":"claude-sonnet-4-6"},"#,
        r#"{"type":"assistant","message":{"content":[{"type":"text","text":"pong"}]},"session_id":"a8fc44db-5540-46ef-9c7f-7ca5b17fd4c6"},"#,
        r#"{"type":"result","subtype":"success","is_error":false,"result":"pong","session_id":"a8fc44db-5540-46ef-9c7f-7ca5b17fd4c6","usage":{"input_tokens":7,"cache_creation_input_tokens":8462,"cache_read_input_tokens":50087,"output_tokens":523}}"#,
        "]",
    );

    fn request(prompt: &str) -> AdapterRequest {
        AdapterRequest {
            assistant: AssistantId::Claude,
            prompt: prompt.to_string(),
            working_directory: None,
            model: None,
            reasoning_effort: None,
            permission_mode: PermissionMode::ReadOnly,
            timeout_ms: 120_000,
            resume_session_id: None,
            run_id: None,
        }
    }

    // ---- Argument construction ----------------------------------------------

    #[test]
    fn build_args_fresh_run_uses_json_output_and_plan_permission() {
        let args = ClaudeAdapter::build_args(&request("hello"));
        assert_eq!(
            args,
            vec![
                "-p",
                "--output-format",
                "json",
                "--permission-mode",
                "plan",
                "hello",
            ]
        );
    }

    #[test]
    fn build_args_includes_model_on_fresh_run_when_present() {
        let mut req = request("hi");
        req.model = Some("claude-opus-4-8".to_string());
        let args = ClaudeAdapter::build_args(&req);
        let model_pos = args
            .iter()
            .position(|a| a == "--model")
            .expect("has --model");
        assert_eq!(args[model_pos + 1], "claude-opus-4-8");
        // Prompt remains the final positional argument.
        assert_eq!(args.last().map(String::as_str), Some("hi"));
    }

    #[test]
    fn build_args_includes_arbitrary_reasoning_effort_when_present() {
        let mut req = request("hi");
        req.reasoning_effort = Some("custom-effort".to_string());
        let args = ClaudeAdapter::build_args(&req);
        let effort_pos = args
            .iter()
            .position(|a| a == "--effort")
            .expect("has --effort");
        assert_eq!(args[effort_pos + 1], "custom-effort");
        assert_eq!(args.last().map(String::as_str), Some("hi"));
    }

    #[test]
    fn build_args_always_enforces_read_only_plan_posture() {
        let args = ClaudeAdapter::build_args(&request("hi"));
        let pos = args
            .iter()
            .position(|a| a == "--permission-mode")
            .expect("has --permission-mode");
        assert_eq!(args[pos + 1], "plan");
    }

    #[test]
    fn build_args_resume_carries_session_id_and_omits_model() {
        let mut req = request("again");
        req.resume_session_id = Some("sid-123".to_string());
        req.model = Some("claude-opus-4-8".to_string());
        let args = ClaudeAdapter::build_args(&req);
        assert_eq!(
            args,
            vec![
                "-p",
                "--output-format",
                "json",
                "--permission-mode",
                "plan",
                "-r",
                "sid-123",
                "again",
            ]
        );
        // A resumed session inherits its model; the flag must not appear.
        assert!(
            !args.contains(&"--model".to_string()),
            "resume must not set --model"
        );
    }

    // ---- Output parsing ------------------------------------------------------

    #[test]
    fn parses_assistant_text_session_id_and_usage_from_array() {
        let parsed = parse_claude_output(FIXTURE).unwrap();
        assert_eq!(parsed.assistant_text, "pong");
        assert_eq!(
            parsed.session_id.as_deref(),
            Some("a8fc44db-5540-46ef-9c7f-7ca5b17fd4c6")
        );
        let usage = parsed.usage.unwrap();
        assert_eq!(usage.input_tokens, 7);
        assert_eq!(usage.cached_input_tokens, 50087);
        assert_eq!(usage.output_tokens, 523);
        assert_eq!(usage.reasoning_output_tokens, 0);
    }

    #[test]
    fn parses_bare_result_object_without_array_wrapper() {
        let single = r#"{"type":"result","subtype":"success","is_error":false,"result":"hi","session_id":"s1","usage":{"input_tokens":1,"output_tokens":2}}"#;
        let parsed = parse_claude_output(single).unwrap();
        assert_eq!(parsed.assistant_text, "hi");
        assert_eq!(parsed.session_id.as_deref(), Some("s1"));
        assert_eq!(parsed.usage.unwrap().output_tokens, 2);
    }

    #[test]
    fn parse_strips_ansi_wrapping_before_parsing() {
        let noisy = format!("\u{1b}[2m{FIXTURE}\u{1b}[0m");
        let parsed = parse_claude_output(&noisy).unwrap();
        assert_eq!(parsed.assistant_text, "pong");
    }

    #[test]
    fn parse_missing_result_event_is_parse_failure() {
        let no_result = r#"[{"type":"system","subtype":"init","session_id":"s"}]"#;
        let err = parse_claude_output(no_result).unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    #[test]
    fn parse_empty_output_is_parse_failure() {
        let err = parse_claude_output("   ").unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    #[test]
    fn parse_non_json_output_is_parse_failure() {
        let err = parse_claude_output("not json at all").unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    #[test]
    fn parse_in_band_error_result_maps_to_non_zero_exit() {
        let errored = r#"[{"type":"result","subtype":"error_during_execution","is_error":true,"result":"the model crashed","session_id":"s"}]"#;
        let err = parse_claude_output(errored).unwrap_err();
        assert!(matches!(
            err,
            AdapterError::NonZeroExit { code: None, stderr } if stderr.contains("the model crashed")
        ));
    }

    #[test]
    fn parse_in_band_auth_error_maps_to_not_authenticated() {
        let errored = r#"[{"type":"result","subtype":"error","is_error":true,"result":"Invalid API key. Please run /login","session_id":"s"}]"#;
        let err = parse_claude_output(errored).unwrap_err();
        assert_eq!(err, AdapterError::NotAuthenticated);
    }

    // ---- Error classification ------------------------------------------------

    #[test]
    fn classify_exit_detects_auth_failure() {
        let err = classify_exit(Some(1), "Error: Invalid API key. Please run /login");
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
            .returning(|_| Ok(vec![("HOME".to_string(), "/home/u".to_string())]));
        env
    }

    fn adapter_with(runner: MockCommandRunner, resolver: MockBinaryResolver) -> ClaudeAdapter {
        ClaudeAdapter::new(Arc::new(resolver), Arc::new(runner), Arc::new(env_ok()))
            .with_neutral_cwd(PathBuf::from("/neutral"))
    }

    fn resolver_ok() -> MockBinaryResolver {
        let mut resolver = MockBinaryResolver::new();
        resolver
            .expect_resolve()
            .returning(|_| Ok(PathBuf::from("/abs/claude")));
        resolver
    }

    #[tokio::test]
    async fn run_happy_path_returns_parsed_result_and_builds_expected_command() {
        let mut runner = MockCommandRunner::new();
        runner
            .expect_run()
            .withf(|spec| {
                spec.program == std::path::Path::new("/abs/claude")
                    && spec.cwd == std::path::Path::new("/neutral")
                    && spec.args
                        == vec![
                            "-p",
                            "--output-format",
                            "json",
                            "--permission-mode",
                            "plan",
                            "ping",
                        ]
                    && spec.stdin.is_none()
                    && spec.env == vec![("HOME".to_string(), "/home/u".to_string())]
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
            Some("a8fc44db-5540-46ef-9c7f-7ca5b17fd4c6")
        );
        assert_eq!(result.usage.unwrap().output_tokens, 523);
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
            AdapterError::NonZeroExit { code: None, stderr } if stderr.contains("cwd denied")
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
    async fn run_maps_auth_failure_from_stderr() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| {
            Ok(RunOutcome::Completed {
                exit_code: Some(1),
                stdout: String::new(),
                stderr: "Invalid API key · Please run /login".to_string(),
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
                stdout: "no result event here".to_string(),
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

    #[test]
    fn id_is_claude() {
        let adapter = ClaudeAdapter::new(
            Arc::new(resolver_ok()),
            Arc::new(MockCommandRunner::new()),
            Arc::new(env_ok()),
        );
        assert_eq!(adapter.id(), AssistantId::Claude);
    }
}
