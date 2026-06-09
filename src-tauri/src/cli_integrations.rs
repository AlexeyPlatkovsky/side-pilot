//! CLI detection and integrations status.
//!
//! On macOS, detection commands are run through a login shell (`/bin/zsh -lc`) so
//! the CLI sees the user's real PATH. On Windows, the command is run through
//! `cmd /C`. Every detection has a 10 s timeout.

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use ts_rs::TS;

use crate::adapters::binary::BinaryResolver;
use crate::adapters::environment::EnvironmentProvider;
use crate::adapters::AssistantId;

pub const DETECTION_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub enum CliDetectionStatus {
    Available,
    NotInstalled,
    NotAuthenticated,
    NotDetected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct CliIntegration {
    pub assistant: AssistantId,
    pub enabled: bool,
    pub detected_status: CliDetectionStatus,
}

impl CliIntegration {
    pub fn for_provider(assistant: AssistantId) -> Self {
        Self {
            assistant,
            enabled: true,
            detected_status: CliDetectionStatus::NotDetected,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct CliIntegrations {
    pub codex: CliIntegration,
    pub claude: CliIntegration,
    pub gemini: CliIntegration,
}

impl Default for CliIntegrations {
    fn default() -> Self {
        Self {
            codex: CliIntegration::for_provider(AssistantId::Codex),
            claude: CliIntegration::for_provider(AssistantId::Claude),
            gemini: CliIntegration::for_provider(AssistantId::Gemini),
        }
    }
}

impl CliIntegrations {
    pub fn for_provider(&self, id: AssistantId) -> &CliIntegration {
        match id {
            AssistantId::Codex => &self.codex,
            AssistantId::Claude => &self.claude,
            AssistantId::Gemini => &self.gemini,
        }
    }

    pub fn for_provider_mut(&mut self, id: AssistantId) -> &mut CliIntegration {
        match id {
            AssistantId::Codex => &mut self.codex,
            AssistantId::Claude => &mut self.claude,
            AssistantId::Gemini => &mut self.gemini,
        }
    }

    pub fn all(&self) -> [&CliIntegration; 3] {
        [&self.codex, &self.claude, &self.gemini]
    }

    pub fn enabled_providers(&self) -> Vec<AssistantId> {
        self.all()
            .iter()
            .filter(|i| i.enabled)
            .map(|i| i.assistant)
            .collect()
    }
}

type DetectShellFn = Arc<dyn Fn(&str, Duration) -> std::io::Result<DetectionRunOutcome> + Send + Sync>;

#[derive(Debug, Clone)]
pub struct DetectionRunOutcome {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

pub struct CliDetector {
    resolver: Arc<dyn BinaryResolver>,
    #[allow(dead_code)]
    env_provider: Arc<dyn EnvironmentProvider>,
    run_shell: DetectShellFn,
}

impl CliDetector {
    pub fn new(
        resolver: Arc<dyn BinaryResolver>,
        env_provider: Arc<dyn EnvironmentProvider>,
    ) -> Self {
        Self {
            resolver,
            env_provider,
            run_shell: Arc::new(system_run_detection_command),
        }
    }

    #[cfg(test)]
    fn with_runner(
        resolver: Arc<dyn BinaryResolver>,
        env_provider: Arc<dyn EnvironmentProvider>,
        run_shell: DetectShellFn,
    ) -> Self {
        Self {
            resolver,
            env_provider,
            run_shell,
        }
    }

    pub async fn detect_all(&self) -> Vec<CliIntegration> {
        let codex_fut = self.detect_single(AssistantId::Codex);
        let claude_fut = self.detect_single(AssistantId::Claude);
        let gemini_fut = self.detect_single(AssistantId::Gemini);
        let (codex, claude, gemini) = tokio::join!(codex_fut, claude_fut, gemini_fut);
        vec![codex, claude, gemini]
    }

    async fn detect_single(&self, id: AssistantId) -> CliIntegration {
        let status = match id {
            AssistantId::Gemini => self.detect_gemini().await,
            AssistantId::Codex => self.detect_with_auth(id, "codex login status").await,
            AssistantId::Claude => self.detect_with_auth(id, "claude auth status").await,
        };
        CliIntegration {
            assistant: id,
            enabled: true,
            detected_status: status,
        }
    }

    async fn detect_gemini(&self) -> CliDetectionStatus {
        match self.resolver.resolve(AssistantId::Gemini).await {
            Ok(_) => CliDetectionStatus::Available,
            Err(_) => CliDetectionStatus::NotInstalled,
        }
    }

    async fn detect_with_auth(&self, id: AssistantId, auth_cmd: &str) -> CliDetectionStatus {
        let binary = match self.resolver.resolve(id).await {
            Ok(path) => path,
            Err(_) => return CliDetectionStatus::NotInstalled,
        };

        let _ = binary; // binary presence confirmed, now check auth

        let run_shell = Arc::clone(&self.run_shell);
        let cmd = auth_cmd.to_string();
        let outcome = tokio::task::spawn_blocking(move || (run_shell)(&cmd, DETECTION_TIMEOUT))
            .await
            .unwrap_or(Err(std::io::Error::other("detection task panicked")));

        match outcome {
            Ok(outcome) => match id {
                AssistantId::Codex => Self::parse_codex_auth(&outcome),
                AssistantId::Claude => Self::parse_claude_auth(&outcome),
                AssistantId::Gemini => unreachable!(),
            },
            Err(_) => CliDetectionStatus::NotDetected,
        }
    }

    fn parse_codex_auth(outcome: &DetectionRunOutcome) -> CliDetectionStatus {
        if outcome.exit_code != Some(0) {
            return CliDetectionStatus::NotDetected;
        }
        let lower = outcome.stdout.to_lowercase();
        if lower.contains("not logged in")
            || lower.contains("not authenticated")
            || lower.contains("login required")
        {
            CliDetectionStatus::NotAuthenticated
        } else if lower.contains("logged in") || lower.contains("authenticated") {
            CliDetectionStatus::Available
        } else {
            CliDetectionStatus::NotDetected
        }
    }

    fn parse_claude_auth(outcome: &DetectionRunOutcome) -> CliDetectionStatus {
        if outcome.exit_code != Some(0) {
            return CliDetectionStatus::NotDetected;
        }
        match serde_json::from_str::<serde_json::Value>(&outcome.stdout) {
            Ok(value) => match value.get("loggedIn").and_then(|v| v.as_bool()) {
                Some(true) => CliDetectionStatus::Available,
                Some(false) => CliDetectionStatus::NotAuthenticated,
                None => CliDetectionStatus::NotDetected,
            },
            Err(_) => CliDetectionStatus::NotDetected,
        }
    }
}

fn system_run_detection_command(
    command: &str,
    timeout: Duration,
) -> std::io::Result<DetectionRunOutcome> {
    #[cfg(windows)]
    {
        let child = std::process::Command::new("cmd")
            .args(["/C", command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        match wait_with_timeout(child, timeout) {
            Ok(output) => Ok(DetectionRunOutcome {
                exit_code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            }),
            Err(e) => Err(e),
        }
    }

    #[cfg(not(windows))]
    {
        let child = std::process::Command::new("/bin/zsh")
            .args(["-lc", command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        match wait_with_timeout(child, timeout) {
            Ok(output) => Ok(DetectionRunOutcome {
                exit_code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            }),
            Err(e) => Err(e),
        }
    }
}

fn wait_with_timeout(
    mut child: std::process::Child,
    timeout: Duration,
) -> std::io::Result<std::process::Output> {
    let start = std::time::Instant::now();
    loop {
        match child.try_wait()? {
            Some(_status) => {
                let output = child.wait_with_output()?;
                return Ok(output);
            }
            None => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        "detection command timed out",
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::binary::MockBinaryResolver;
    use crate::adapters::environment::MockEnvironmentProvider;
    use crate::adapters::AdapterError;
    use std::path::PathBuf;

    fn detector_with_resolver(
        resolver: Arc<dyn BinaryResolver>,
        runner: DetectShellFn,
    ) -> CliDetector {
        let env = Arc::new(MockEnvironmentProvider::new());
        CliDetector::with_runner(resolver, env, runner)
    }

    fn mock_binary_found() -> Arc<MockBinaryResolver> {
        let mut resolver = MockBinaryResolver::new();
        resolver
            .expect_resolve()
            .returning(|_| Ok(PathBuf::from("/usr/local/bin/test-cli")));
        Arc::new(resolver)
    }

    fn mock_binary_not_found() -> Arc<MockBinaryResolver> {
        let mut resolver = MockBinaryResolver::new();
        resolver
            .expect_resolve()
            .returning(|_| Err(AdapterError::BinaryNotFound));
        Arc::new(resolver)
    }

    fn shell_runner(
        exit_code: Option<i32>,
        stdout: String,
    ) -> DetectShellFn {
        Arc::new(move |_cmd, _timeout| {
            Ok(DetectionRunOutcome {
                exit_code,
                stdout: stdout.clone(),
                stderr: String::new(),
            })
        })
    }

    fn shell_runner_error() -> DetectShellFn {
        Arc::new(|_cmd, _timeout| {
            Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "timeout",
            ))
        })
    }

    // --- Codex tests ---

    #[tokio::test]
    async fn codex_available_when_logged_in() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), "Logged in using ChatGPT".to_string()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::Available);
    }

    #[tokio::test]
    async fn codex_not_authenticated_when_not_logged_in() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), "Not logged in. Run 'codex login' first.".to_string()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotAuthenticated);
    }

    #[tokio::test]
    async fn codex_not_installed_when_binary_not_found() {
        let detector = detector_with_resolver(mock_binary_not_found(), shell_runner(Some(0), String::new()));
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotInstalled);
    }

    #[tokio::test]
    async fn codex_not_detected_when_command_fails() {
        let detector = detector_with_resolver(mock_binary_found(), shell_runner_error());
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotDetected);
    }

    #[tokio::test]
    async fn codex_not_detected_when_nonzero_exit() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(1), String::new()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotDetected);
    }

    #[tokio::test]
    async fn codex_not_detected_when_unknown_output() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), "Some unexpected output".to_string()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotDetected);
    }

    // --- Claude tests ---

    #[tokio::test]
    async fn claude_available_when_logged_in() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), r#"{"loggedIn":true}"#.to_string()),
        );
        let result = detector.detect_single(AssistantId::Claude).await;
        assert_eq!(result.detected_status, CliDetectionStatus::Available);
    }

    #[tokio::test]
    async fn claude_not_authenticated_when_not_logged_in() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), r#"{"loggedIn":false}"#.to_string()),
        );
        let result = detector.detect_single(AssistantId::Claude).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotAuthenticated);
    }

    #[tokio::test]
    async fn claude_not_detected_when_json_missing_logged_in() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), r#"{"status":"ok"}"#.to_string()),
        );
        let result = detector.detect_single(AssistantId::Claude).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotDetected);
    }

    #[tokio::test]
    async fn claude_not_detected_when_nonzero_exit() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(1), String::new()),
        );
        let result = detector.detect_single(AssistantId::Claude).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotDetected);
    }

    // --- Gemini tests ---

    #[tokio::test]
    async fn gemini_available_when_binary_found() {
        let detector = detector_with_resolver(mock_binary_found(), shell_runner(Some(0), String::new()));
        let result = detector.detect_single(AssistantId::Gemini).await;
        assert_eq!(result.detected_status, CliDetectionStatus::Available);
    }

    #[tokio::test]
    async fn gemini_not_installed_when_binary_not_found() {
        let detector = detector_with_resolver(mock_binary_not_found(), shell_runner(Some(0), String::new()));
        let result = detector.detect_single(AssistantId::Gemini).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotInstalled);
    }

    // --- Integration defaults ---

    #[test]
    fn default_integrations_have_correct_providers() {
        let integrations = CliIntegrations::default();
        assert_eq!(integrations.codex.assistant, AssistantId::Codex);
        assert_eq!(integrations.claude.assistant, AssistantId::Claude);
        assert_eq!(integrations.gemini.assistant, AssistantId::Gemini);
        assert!(integrations.codex.enabled);
        assert!(integrations.claude.enabled);
        assert!(integrations.gemini.enabled);
    }

    #[test]
    fn enabled_providers_filters_correctly() {
        let mut integrations = CliIntegrations::default();
        integrations.claude.enabled = false;
        let enabled = integrations.enabled_providers();
        assert_eq!(enabled.len(), 2);
        assert!(enabled.contains(&AssistantId::Codex));
        assert!(!enabled.contains(&AssistantId::Claude));
        assert!(enabled.contains(&AssistantId::Gemini));
    }

    #[test]
    fn all_method_returns_all_three() {
        let integrations = CliIntegrations::default();
        let all = integrations.all();
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].assistant, AssistantId::Codex);
        assert_eq!(all[1].assistant, AssistantId::Claude);
        assert_eq!(all[2].assistant, AssistantId::Gemini);
    }
}
