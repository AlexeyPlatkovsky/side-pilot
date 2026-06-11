//! Custom (user-registered) CLI adapter (SP-072).
//!
//! Unlike the three built-in adapters, a custom CLI is not resolved to an
//! absolute binary and invoked with structured-output flags. Instead the user
//! supplies a "CLI Prompt Command" prefix (e.g. `opencode --prompt`); side-pilot
//! runs that command through a **login shell** (`/bin/zsh -lc` on macOS, `cmd /C`
//! on Windows — the same shell posture as `BinaryResolver`/detection), writes the
//! user's prompt to the process's **stdin**, and treats plain **stdout** as the
//! reply. There is no output cap. The per-run timeout is fixed at 30 s.
//!
//! The resolved command travels in [`AdapterRequest::custom_command`]
//! (resolved server-side from the persisted custom entries), so this single
//! adapter drives every registered custom CLI without per-entry registration.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use super::contract::{AdapterRequest, AdapterResult};
use super::error::AdapterError;
use super::process::{CommandRunner, CommandSpec, RunOutcome};
use super::shared::map_runner_io_error;
use super::{AssistantId, CliAdapter};

/// Fixed per-run timeout for custom CLIs (SP-072). The same value backs the
/// Add-dialog "Test" and startup detection.
pub const CUSTOM_CLI_TIMEOUT: Duration = Duration::from_secs(30);

/// Token a user may embed in their command string to indicate where the prompt
/// text should be injected as a CLI argument (instead of via stdin).
///
/// Example: `opencode --prompt {prompt}` → the adapter replaces the token with
/// a shell-safe reference and passes the actual prompt as a positional argument.
const PROMPT_PLACEHOLDER: &str = "{prompt}";

/// Build the login-shell [`CommandSpec`] that runs `command` with the prompt
/// delivered via one of two mechanisms:
///
/// * **Stdin** (default, no placeholder): the prompt is written to the child's
///   stdin. Use for CLIs that read their prompt from a pipe (e.g. `my-cli -i`).
/// * **Positional argument** (`{prompt}` present): replace `{prompt}` with a
///   safe shell reference and pass the actual text as a separate shell argument.
///   Use for CLIs whose flag takes the text inline (e.g. `opencode --prompt`).
///   The injection is shell-injection-safe: the prompt value is passed as a
///   discrete shell positional arg (`$1` on Unix), never interpolated into the
///   command string, so special characters in the prompt are always literal.
fn build_spec(
    command: &str,
    prompt: &str,
    cwd: PathBuf,
    timeout: Duration,
    cancel: CancellationToken,
) -> CommandSpec {
    #[cfg(windows)]
    let (program, prefix): (&str, &str) = ("cmd", "/C");
    #[cfg(not(windows))]
    let (program, prefix): (&str, &str) = ("/bin/zsh", "-lc");

    if command.contains(PROMPT_PLACEHOLDER) {
        // Unix: replace {prompt} with "$1" and pass the actual prompt as $1.
        // The shell expands "$1" to the positional argument value without further
        // interpretation, so $(...), backticks, and quotes in the prompt are safe.
        #[cfg(not(windows))]
        return CommandSpec {
            program: PathBuf::from(program),
            args: vec![
                prefix.to_string(),
                command.replace(PROMPT_PLACEHOLDER, r#""$1""#),
                "_".to_string(),       // $0 (dummy script name)
                prompt.to_string(),    // $1 — the actual prompt value
            ],
            cwd,
            env: Vec::new(),
            stdin: None,
            timeout,
            cancel,
        };
        // Windows: inject the prompt via an env var referenced in the command.
        #[cfg(windows)]
        return CommandSpec {
            program: PathBuf::from(program),
            args: vec![
                prefix.to_string(),
                command.replace(PROMPT_PLACEHOLDER, "%SIDE_PILOT_PROMPT%"),
            ],
            cwd,
            env: vec![("SIDE_PILOT_PROMPT".to_string(), prompt.to_string())],
            stdin: None,
            timeout,
            cancel,
        };
    }

    CommandSpec {
        program: PathBuf::from(program),
        args: vec![prefix.to_string(), command.to_string()],
        cwd,
        env: Vec::new(),
        stdin: Some(prompt.to_string()),
        timeout,
        cancel,
    }
}

/// Run a custom CLI command once: pipe `prompt` to its stdin and capture stdout.
///
/// Success is **exit 0 with non-empty stdout** → `Ok(stdout)`. Every other
/// terminal state maps onto the shared [`AdapterError`] taxonomy:
/// - exit 0 but empty stdout → [`AdapterError::OutputParseFailure`]
/// - any non-zero exit → [`AdapterError::NonZeroExit`]
/// - timeout / cancellation → [`AdapterError::TimedOut`] / [`AdapterError::Cancelled`]
/// - failure to spawn the shell → [`AdapterError::BinaryNotFound`]
pub async fn run_custom_command(
    runner: &dyn CommandRunner,
    command: &str,
    prompt: &str,
    cwd: PathBuf,
    timeout: Duration,
    cancel: CancellationToken,
) -> Result<String, AdapterError> {
    let spec = build_spec(command, prompt, cwd, timeout, cancel);
    match runner.run(spec).await.map_err(map_runner_io_error)? {
        RunOutcome::TimedOut => Err(AdapterError::TimedOut),
        RunOutcome::Cancelled => Err(AdapterError::Cancelled),
        RunOutcome::Completed {
            exit_code,
            stdout,
            stderr,
        } => {
            if exit_code != Some(0) {
                return Err(AdapterError::NonZeroExit {
                    code: exit_code,
                    stderr,
                });
            }
            if stdout.trim().is_empty() {
                return Err(AdapterError::OutputParseFailure {
                    detail: "custom CLI produced no output".to_string(),
                });
            }
            Ok(stdout)
        }
    }
}

/// Adapter that drives any user-registered custom CLI (SP-072).
pub struct CustomCliAdapter {
    runner: Arc<dyn CommandRunner>,
    /// Neutral working directory (never the app bundle), mirroring the built-in
    /// adapters' §3 posture.
    neutral_cwd: PathBuf,
}

impl CustomCliAdapter {
    pub fn new(runner: Arc<dyn CommandRunner>) -> Self {
        Self {
            runner,
            neutral_cwd: std::env::temp_dir(),
        }
    }

    #[cfg(test)]
    fn with_neutral_cwd(mut self, cwd: PathBuf) -> Self {
        self.neutral_cwd = cwd;
        self
    }
}

#[async_trait]
impl CliAdapter for CustomCliAdapter {
    /// A sentinel id. The registry routes every [`AssistantId::Custom`] to this
    /// single adapter via a dedicated slot, so this value is never used as a
    /// lookup key.
    fn id(&self) -> AssistantId {
        AssistantId::Custom(String::new())
    }

    async fn run(
        &self,
        req: AdapterRequest,
        cancel: CancellationToken,
    ) -> Result<AdapterResult, AdapterError> {
        // A custom route without a resolved command cannot be driven; surface it
        // the same way a missing binary would be.
        let command = match req.custom_command.as_deref() {
            Some(command) if !command.trim().is_empty() => command.to_string(),
            _ => return Err(AdapterError::BinaryNotFound),
        };

        let stdout = run_custom_command(
            self.runner.as_ref(),
            &command,
            &req.prompt,
            self.neutral_cwd.clone(),
            CUSTOM_CLI_TIMEOUT,
            cancel,
        )
        .await?;

        Ok(AdapterResult {
            assistant_text: stdout.clone(),
            raw_json: stdout,
            native_session_id: None,
            usage: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::contract::PermissionMode;
    use crate::adapters::process::MockCommandRunner;

    fn custom_request(prompt: &str, command: Option<&str>) -> AdapterRequest {
        AdapterRequest {
            assistant: AssistantId::Custom("OpenCode".to_string()),
            prompt: prompt.to_string(),
            working_directory: None,
            model: None,
            reasoning_effort: None,
            permission_mode: PermissionMode::ReadOnly,
            timeout_ms: 1000,
            resume_session_id: None,
            run_id: None,
            custom_command: command.map(str::to_string),
        }
    }

    fn adapter_with(runner: MockCommandRunner) -> CustomCliAdapter {
        CustomCliAdapter::new(Arc::new(runner)).with_neutral_cwd(PathBuf::from("/neutral"))
    }

    #[test]
    fn build_spec_pipes_prompt_to_stdin_via_login_shell() {
        let spec = build_spec(
            "opencode --prompt",
            "hello",
            PathBuf::from("/neutral"),
            CUSTOM_CLI_TIMEOUT,
            CancellationToken::new(),
        );
        assert_eq!(spec.stdin.as_deref(), Some("hello"));
        assert_eq!(spec.cwd, PathBuf::from("/neutral"));
        assert_eq!(spec.timeout, CUSTOM_CLI_TIMEOUT);
        // The command is passed as a single argument after the shell flag.
        assert_eq!(spec.args.last().map(String::as_str), Some("opencode --prompt"));
        #[cfg(not(windows))]
        {
            assert_eq!(spec.program, PathBuf::from("/bin/zsh"));
            assert_eq!(spec.args[0], "-lc");
        }
        #[cfg(windows)]
        {
            assert_eq!(spec.program, PathBuf::from("cmd"));
            assert_eq!(spec.args[0], "/C");
        }
    }

    #[test]
    fn build_spec_with_prompt_placeholder_passes_prompt_as_positional_arg() {
        let spec = build_spec(
            "opencode --prompt {prompt}",
            "hello world",
            PathBuf::from("/neutral"),
            CUSTOM_CLI_TIMEOUT,
            CancellationToken::new(),
        );
        // The placeholder path never uses stdin.
        assert_eq!(spec.stdin, None);
        assert_eq!(spec.cwd, PathBuf::from("/neutral"));
        #[cfg(not(windows))]
        {
            // Script contains "$1" (safe positional reference).
            assert!(
                spec.args[1].contains(r#""$1""#),
                "script should reference $1, got: {:?}",
                spec.args[1]
            );
            // $0 is the dummy name; $1 is the actual prompt.
            assert_eq!(spec.args[2], "_");
            assert_eq!(spec.args[3], "hello world");
            assert!(spec.env.is_empty());
        }
        #[cfg(windows)]
        {
            assert!(spec.args[1].contains("%SIDE_PILOT_PROMPT%"));
            assert_eq!(spec.env[0].0, "SIDE_PILOT_PROMPT");
            assert_eq!(spec.env[0].1, "hello world");
        }
    }

    #[tokio::test]
    async fn run_returns_stdout_as_reply_on_success() {
        let mut runner = MockCommandRunner::new();
        runner
            .expect_run()
            .withf(|spec| {
                spec.stdin.as_deref() == Some("ping")
                    && spec.args.last().map(String::as_str) == Some("opencode --prompt")
            })
            .returning(|_| {
                Ok(RunOutcome::Completed {
                    exit_code: Some(0),
                    stdout: "pong".to_string(),
                    stderr: String::new(),
                })
            });

        let adapter = adapter_with(runner);
        let result = adapter
            .run(custom_request("ping", Some("opencode --prompt")), CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(result.assistant_text, "pong");
        assert_eq!(result.raw_json, "pong");
        assert_eq!(result.native_session_id, None);
    }

    #[tokio::test]
    async fn run_without_resolved_command_is_binary_not_found() {
        // Runner must never be called when the command is missing.
        let adapter = adapter_with(MockCommandRunner::new());
        let err = adapter
            .run(custom_request("ping", None), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::BinaryNotFound);
    }

    #[tokio::test]
    async fn run_empty_stdout_on_success_is_output_parse_failure() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| {
            Ok(RunOutcome::Completed {
                exit_code: Some(0),
                stdout: "   \n".to_string(),
                stderr: String::new(),
            })
        });
        let adapter = adapter_with(runner);
        let err = adapter
            .run(custom_request("ping", Some("cli")), CancellationToken::new())
            .await
            .unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    #[tokio::test]
    async fn run_non_zero_exit_maps_to_non_zero_exit() {
        let mut runner = MockCommandRunner::new();
        runner.expect_run().returning(|_| {
            Ok(RunOutcome::Completed {
                exit_code: Some(127),
                stdout: String::new(),
                stderr: "command not found".to_string(),
            })
        });
        let adapter = adapter_with(runner);
        let err = adapter
            .run(custom_request("ping", Some("nonexistent-cli")), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(
            err,
            AdapterError::NonZeroExit {
                code: Some(127),
                stderr: "command not found".to_string()
            }
        );
    }

    #[tokio::test]
    async fn run_timeout_and_cancel_map_through() {
        let mut timeout_runner = MockCommandRunner::new();
        timeout_runner
            .expect_run()
            .returning(|_| Ok(RunOutcome::TimedOut));
        let err = adapter_with(timeout_runner)
            .run(custom_request("ping", Some("cli")), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::TimedOut);

        let mut cancel_runner = MockCommandRunner::new();
        cancel_runner
            .expect_run()
            .returning(|_| Ok(RunOutcome::Cancelled));
        let err = adapter_with(cancel_runner)
            .run(custom_request("ping", Some("cli")), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::Cancelled);
    }

    #[tokio::test]
    async fn run_spawn_failure_maps_to_binary_not_found() {
        let mut runner = MockCommandRunner::new();
        runner
            .expect_run()
            .returning(|_| Err(std::io::Error::new(std::io::ErrorKind::NotFound, "no shell")));
        let err = adapter_with(runner)
            .run(custom_request("ping", Some("cli")), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::BinaryNotFound);
    }
}
