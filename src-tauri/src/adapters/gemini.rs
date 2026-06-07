//! Gemini adapter.
//!
//! Drives `gemini -p` in non-interactive, read-only, blocking mode and parses
//! its `-o json` result into a typed [`AdapterResult`]. See the CLI Invocation
//! Contract (`docs/idea.md` §1–§9). Verified against Gemini CLI 0.44.1, whose
//! `-o json` emits a single JSON object:
//!
//! ```text
//! {
//!   "session_id": "<uuid>",
//!   "response": "pong",
//!   "stats": { "models": { "<model>": { "tokens": {
//!       "input": 13526, "cached": 0, "candidates": 7, "thoughts": 170 } } } }
//! }
//! ```
//!
//! Two verified divergences from the `docs/idea.md` §1 table:
//! - The neutral/temp working directory (§3) is **untrusted**, so headless runs
//!   are refused (and `--approval-mode` is silently downgraded) unless
//!   `--skip-trust` is passed. The adapter always passes it; combined with the
//!   read-only `plan` approval mode the tool still cannot edit or execute.
//! - `gemini --resume <id>` resumes a previous session **by its UUID** (verified
//!   gemini 0.45.2: a resumed run remembers prior turns and keeps the same
//!   `session_id`), even though `--help` only documents `"latest"`/index. The
//!   adapter therefore wires `resume_session_id` into `--resume` like Claude/
//!   Codex (§6), targeting gemini 0.45.2+. Older builds (≤0.44.1) only accepted
//!   `"latest"`/index and would reject a UUID; the per-provider diff is always
//!   composed regardless, so context is never lost on a build that resumes.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::binary::BinaryResolver;
use super::contract::{AdapterRequest, AdapterResult, PermissionMode, Usage};
use super::environment::EnvironmentProvider;
use super::error::AdapterError;
use super::json::parse_json_lenient;
use super::process::{CommandRunner, CommandSpec, RunOutcome};
use super::{AssistantId, CliAdapter};

/// Adapter that runs the Gemini CLI.
pub struct GeminiAdapter {
    resolver: Arc<dyn BinaryResolver>,
    runner: Arc<dyn CommandRunner>,
    env_provider: Arc<dyn EnvironmentProvider>,
    /// Neutral working directory used when a request carries no workspace (§3).
    neutral_cwd: PathBuf,
}

impl GeminiAdapter {
    /// Build a Gemini adapter from a binary resolver, command runner, and
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
    /// neutral app-controlled directory when none is supplied (§3, MVP). Gemini
    /// inherits its workspace root from the process `cwd` (§1).
    fn resolve_cwd(&self, req: &AdapterRequest) -> PathBuf {
        req.working_directory
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| self.neutral_cwd.clone())
    }

    /// Construct the `gemini` argument vector for a request.
    ///
    /// `--skip-trust` is always passed so the read-only `plan` approval posture
    /// (§4) survives in the untrusted neutral cwd (§3); without it Gemini
    /// refuses headless runs and downgrades the approval mode (verified gemini
    /// 0.44.1). The prompt is the value of the trailing `-p` flag. Reasoning
    /// effort has no Gemini equivalent, so it never affects the command; a
    /// resumed session (`--resume <id>`) inherits the model of its originating
    /// session, so `-m` applies on fresh runs only (§6).
    fn build_args(req: &AdapterRequest) -> Vec<String> {
        let mut args: Vec<String> = vec!["-o".to_string(), "json".to_string()];

        // Read-only posture, always enforced (§4): Gemini `plan` approval mode,
        // kept by trusting the workspace for this read-only session.
        let PermissionMode::ReadOnly = req.permission_mode;
        args.push("--approval-mode".to_string());
        args.push("plan".to_string());
        args.push("--skip-trust".to_string());

        // Native session resume by UUID (`--resume <id>`, verified gemini 0.45.2).
        // A resumed session inherits the model of its originating session, so
        // model selection applies on fresh runs only (mirrors Claude/Codex, §6).
        if let Some(session_id) = &req.resume_session_id {
            args.push("--resume".to_string());
            args.push(session_id.clone());
        } else if let Some(model) = &req.model {
            args.push("-m".to_string());
            args.push(model.clone());
        }

        args.push("-p".to_string());
        args.push(req.prompt.clone());
        args
    }
}

#[async_trait]
impl CliAdapter for GeminiAdapter {
    fn id(&self) -> AssistantId {
        AssistantId::Gemini
    }

    async fn run(
        &self,
        req: AdapterRequest,
        cancel: CancellationToken,
    ) -> Result<AdapterResult, AdapterError> {
        let program = self.resolver.resolve(AssistantId::Gemini).await?;
        let env = self.env_provider.environment(AssistantId::Gemini).await?;
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
                let parsed = parse_gemini_output(&stdout)?;
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

/// Parsed pieces of a successful Gemini result object.
#[derive(Debug)]
struct ParsedGemini {
    assistant_text: String,
    session_id: Option<String>,
    usage: Option<Usage>,
}

/// Gemini nests per-model token counts under `stats.models.<name>.tokens`.
#[derive(Deserialize)]
struct GeminiStats {
    #[serde(default)]
    models: HashMap<String, GeminiModelStats>,
}

#[derive(Deserialize)]
struct GeminiModelStats {
    #[serde(default)]
    tokens: GeminiTokens,
}

#[derive(Deserialize, Default)]
struct GeminiTokens {
    #[serde(default)]
    input: u64,
    #[serde(default)]
    cached: u64,
    #[serde(default)]
    candidates: u64,
    #[serde(default)]
    thoughts: u64,
}

/// Parse Gemini's `-o json` single result object into the typed result (§5).
///
/// An in-band `error` field maps onto the taxonomy rather than being surfaced
/// as assistant text. Token usage is summed across every model in `stats`.
fn parse_gemini_output(stdout: &str) -> Result<ParsedGemini, AdapterError> {
    let value = parse_json_lenient(stdout)?;
    let obj = value
        .as_object()
        .ok_or_else(|| AdapterError::OutputParseFailure {
            detail: "gemini output was not a JSON object".to_string(),
        })?;

    if let Some(error) = obj.get("error") {
        return Err(classify_error_text(error_message(error)));
    }

    let assistant_text = obj
        .get("response")
        .and_then(Value::as_str)
        .ok_or_else(|| AdapterError::OutputParseFailure {
            detail: "gemini output has no response field".to_string(),
        })?
        .to_string();

    let session_id = obj
        .get("session_id")
        .and_then(Value::as_str)
        .map(str::to_string);

    let usage = obj.get("stats").and_then(parse_usage);

    Ok(ParsedGemini {
        assistant_text,
        session_id,
        usage,
    })
}

/// Sum per-model token counts in `stats` onto the IPC [`Usage`] shape. Returns
/// `None` when no model usage is reported.
fn parse_usage(stats: &Value) -> Option<Usage> {
    let parsed: GeminiStats = serde_json::from_value(stats.clone()).ok()?;
    if parsed.models.is_empty() {
        return None;
    }
    let mut usage = Usage::default();
    for model in parsed.models.values() {
        usage.input_tokens += model.tokens.input;
        usage.cached_input_tokens += model.tokens.cached;
        usage.output_tokens += model.tokens.candidates;
        usage.reasoning_output_tokens += model.tokens.thoughts;
    }
    Some(usage)
}

/// Extract a human-readable message from an in-band `error` value, which may be
/// a bare string or an object with a `message` field.
fn error_message(error: &Value) -> String {
    match error {
        Value::String(s) => s.clone(),
        Value::Object(map) => map
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| error.to_string()),
        other => other.to_string(),
    }
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

/// Recognize Gemini authentication failures from CLI text (§8).
fn is_auth_failure(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    const AUTH_MARKERS: [&str; 7] = [
        "api key",
        "gemini_api_key",
        "not authenticated",
        "unauthorized",
        "authentication",
        "please sign in",
        "credentials",
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
        "{",
        r#""session_id":"f261c437-db40-4f5f-8e73-c48216de393d","#,
        r#""response":"pong","#,
        r#""stats":{"models":{"gemini-3-flash-preview":{"tokens":{"input":13526,"prompt":13526,"candidates":7,"total":13697,"cached":4,"thoughts":170,"tool":0}}}}"#,
        "}",
    );

    fn request(prompt: &str) -> AdapterRequest {
        AdapterRequest {
            assistant: AssistantId::Gemini,
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
    fn build_args_fresh_run_uses_json_output_plan_approval_and_skip_trust() {
        let args = GeminiAdapter::build_args(&request("hello"));
        assert_eq!(
            args,
            vec![
                "-o",
                "json",
                "--approval-mode",
                "plan",
                "--skip-trust",
                "-p",
                "hello",
            ]
        );
    }

    #[test]
    fn build_args_includes_model_when_present() {
        let mut req = request("hi");
        req.model = Some("gemini-3-pro".to_string());
        let args = GeminiAdapter::build_args(&req);
        let model_pos = args.iter().position(|a| a == "-m").expect("has -m");
        assert_eq!(args[model_pos + 1], "gemini-3-pro");
        // Prompt is the value of the trailing -p flag.
        assert_eq!(args.last().map(String::as_str), Some("hi"));
        let p_pos = args.iter().position(|a| a == "-p").expect("has -p");
        assert_eq!(args[p_pos + 1], "hi");
    }

    #[test]
    fn build_args_always_enforces_plan_approval_and_skip_trust() {
        let args = GeminiAdapter::build_args(&request("hi"));
        let pos = args
            .iter()
            .position(|a| a == "--approval-mode")
            .expect("has --approval-mode");
        assert_eq!(args[pos + 1], "plan");
        assert!(
            args.contains(&"--skip-trust".to_string()),
            "must pass --skip-trust so plan mode is honored in the untrusted neutral cwd"
        );
    }

    #[test]
    fn build_args_resume_carries_session_id_and_omits_model() {
        let mut req = request("again");
        req.resume_session_id = Some("f261c437-db40-4f5f-8e73-c48216de393d".to_string());
        req.model = Some("gemini-3-pro".to_string());
        let args = GeminiAdapter::build_args(&req);
        // gemini 0.45.2 resumes a session by its UUID via `--resume <id>`; the
        // read-only posture flags are still enforced on resume.
        assert_eq!(
            args,
            vec![
                "-o",
                "json",
                "--approval-mode",
                "plan",
                "--skip-trust",
                "--resume",
                "f261c437-db40-4f5f-8e73-c48216de393d",
                "-p",
                "again",
            ]
        );
        // A resumed session inherits its model, so the flag must not appear.
        assert!(
            !args.contains(&"-m".to_string()),
            "resume must not set -m"
        );
    }

    // ---- Output parsing ------------------------------------------------------

    #[test]
    fn parses_response_session_id_and_summed_usage() {
        let parsed = parse_gemini_output(FIXTURE).unwrap();
        assert_eq!(parsed.assistant_text, "pong");
        assert_eq!(
            parsed.session_id.as_deref(),
            Some("f261c437-db40-4f5f-8e73-c48216de393d")
        );
        let usage = parsed.usage.unwrap();
        assert_eq!(usage.input_tokens, 13526);
        assert_eq!(usage.cached_input_tokens, 4);
        assert_eq!(usage.output_tokens, 7);
        assert_eq!(usage.reasoning_output_tokens, 170);
    }

    #[test]
    fn parse_sums_usage_across_multiple_models() {
        let multi = r#"{"session_id":"s","response":"hi","stats":{"models":{
            "a":{"tokens":{"input":10,"candidates":2,"cached":1,"thoughts":3}},
            "b":{"tokens":{"input":5,"candidates":1,"cached":0,"thoughts":4}}
        }}}"#;
        let usage = parse_gemini_output(multi).unwrap().usage.unwrap();
        assert_eq!(usage.input_tokens, 15);
        assert_eq!(usage.output_tokens, 3);
        assert_eq!(usage.cached_input_tokens, 1);
        assert_eq!(usage.reasoning_output_tokens, 7);
    }

    #[test]
    fn parse_without_stats_yields_no_usage() {
        let no_stats = r#"{"session_id":"s","response":"hi"}"#;
        let parsed = parse_gemini_output(no_stats).unwrap();
        assert_eq!(parsed.assistant_text, "hi");
        assert!(parsed.usage.is_none());
    }

    #[test]
    fn parse_strips_ansi_wrapping_before_parsing() {
        let noisy = format!("\u{1b}[2m{FIXTURE}\u{1b}[0m");
        let parsed = parse_gemini_output(&noisy).unwrap();
        assert_eq!(parsed.assistant_text, "pong");
    }

    #[test]
    fn parse_missing_response_is_parse_failure() {
        let no_response = r#"{"session_id":"s","stats":{"models":{}}}"#;
        let err = parse_gemini_output(no_response).unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    #[test]
    fn parse_empty_output_is_parse_failure() {
        let err = parse_gemini_output("   ").unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    #[test]
    fn parse_non_json_output_is_parse_failure() {
        let err = parse_gemini_output("not json at all").unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    #[test]
    fn parse_in_band_error_object_maps_to_non_zero_exit() {
        let errored = r#"{"error":"quota exceeded"}"#;
        let err = parse_gemini_output(errored).unwrap_err();
        assert!(matches!(
            err,
            AdapterError::NonZeroExit { code: None, stderr } if stderr.contains("quota exceeded")
        ));
    }

    #[test]
    fn parse_in_band_auth_error_maps_to_not_authenticated() {
        let errored = r#"{"error":{"message":"Invalid API key provided"}}"#;
        let err = parse_gemini_output(errored).unwrap_err();
        assert_eq!(err, AdapterError::NotAuthenticated);
    }

    // ---- Error classification ------------------------------------------------

    #[test]
    fn classify_exit_detects_auth_failure() {
        let err = classify_exit(Some(1), "Error: Invalid API key. Set GEMINI_API_KEY.");
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

    fn adapter_with(runner: MockCommandRunner, resolver: MockBinaryResolver) -> GeminiAdapter {
        GeminiAdapter::new(Arc::new(resolver), Arc::new(runner), Arc::new(env_ok()))
            .with_neutral_cwd(PathBuf::from("/neutral"))
    }

    fn resolver_ok() -> MockBinaryResolver {
        let mut resolver = MockBinaryResolver::new();
        resolver
            .expect_resolve()
            .returning(|_| Ok(PathBuf::from("/abs/gemini")));
        resolver
    }

    #[tokio::test]
    async fn run_happy_path_returns_parsed_result_and_builds_expected_command() {
        let mut runner = MockCommandRunner::new();
        runner
            .expect_run()
            .withf(|spec| {
                spec.program == std::path::Path::new("/abs/gemini")
                    && spec.cwd == std::path::Path::new("/neutral")
                    && spec.args
                        == vec![
                            "-o",
                            "json",
                            "--approval-mode",
                            "plan",
                            "--skip-trust",
                            "-p",
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
            Some("f261c437-db40-4f5f-8e73-c48216de393d")
        );
        assert_eq!(result.usage.unwrap().reasoning_output_tokens, 170);
    }

    #[tokio::test]
    async fn run_maps_binary_resolution_failure() {
        let mut resolver = MockBinaryResolver::new();
        resolver
            .expect_resolve()
            .returning(|_| Err(AdapterError::BinaryNotFound));
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
                stderr: "Error: Invalid API key. Set GEMINI_API_KEY.".to_string(),
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
                stdout: "no json here".to_string(),
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
    fn id_is_gemini() {
        let adapter = GeminiAdapter::new(
            Arc::new(resolver_ok()),
            Arc::new(MockCommandRunner::new()),
            Arc::new(env_ok()),
        );
        assert_eq!(adapter.id(), AssistantId::Gemini);
    }
}
