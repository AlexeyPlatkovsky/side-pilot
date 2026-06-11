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

/// A user-registered custom CLI provider (SP-072).
///
/// The user supplies a display `name` (≤30 chars) and a `command` prefix (the
/// "CLI Prompt Command", ≤100 chars, e.g. `opencode --prompt`). side-pilot runs
/// the command through a login shell, writes the user's prompt to its stdin, and
/// treats plain stdout as the reply.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct CustomCliEntry {
    pub name: String,
    pub command: String,
    pub enabled: bool,
    pub detected_status: CliDetectionStatus,
}

impl CustomCliEntry {
    /// The first whitespace-delimited token of the command — the "base command"
    /// used for duplicate/reserved-token detection (SP-072).
    pub fn base_command(&self) -> &str {
        self.command.split_whitespace().next().unwrap_or("")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct CliIntegrations {
    pub codex: CliIntegration,
    pub claude: CliIntegration,
    pub gemini: CliIntegration,
    /// User-registered custom CLIs (SP-072). Defaults to empty so preferences
    /// files written before SP-072 still deserialize.
    #[serde(default)]
    pub custom: Vec<CustomCliEntry>,
}

impl Default for CliIntegrations {
    fn default() -> Self {
        Self {
            codex: CliIntegration::for_provider(AssistantId::Codex),
            claude: CliIntegration::for_provider(AssistantId::Claude),
            gemini: CliIntegration::for_provider(AssistantId::Gemini),
            custom: Vec::new(),
        }
    }
}

impl CliIntegrations {
    pub fn for_provider(&self, id: AssistantId) -> &CliIntegration {
        match id {
            AssistantId::Codex => &self.codex,
            AssistantId::Claude => &self.claude,
            AssistantId::Gemini => &self.gemini,
            // Custom providers have no built-in slot; callers needing a custom
            // entry use `custom_entry`. Falling back to codex keeps the legacy
            // built-in accessor total without panicking.
            AssistantId::Custom(_) => &self.codex,
        }
    }

    pub fn for_provider_mut(&mut self, id: AssistantId) -> &mut CliIntegration {
        match id {
            AssistantId::Codex => &mut self.codex,
            AssistantId::Claude => &mut self.claude,
            AssistantId::Gemini => &mut self.gemini,
            AssistantId::Custom(_) => &mut self.codex,
        }
    }

    pub fn all(&self) -> [&CliIntegration; 3] {
        [&self.codex, &self.claude, &self.gemini]
    }

    /// Find a custom entry by its (case-sensitive) display name.
    pub fn custom_entry(&self, name: &str) -> Option<&CustomCliEntry> {
        self.custom.iter().find(|entry| entry.name == name)
    }

    /// The command prefix for a custom provider id, if registered.
    pub fn custom_command(&self, id: &AssistantId) -> Option<String> {
        match id {
            AssistantId::Custom(name) => {
                self.custom_entry(name).map(|entry| entry.command.clone())
            }
            _ => None,
        }
    }

    /// A name → command map of every registered custom CLI, used by the router
    /// to resolve a custom provider's "CLI Prompt Command" at dispatch time.
    pub fn custom_command_map(&self) -> std::collections::HashMap<String, String> {
        self.custom
            .iter()
            .map(|entry| (entry.name.clone(), entry.command.clone()))
            .collect()
    }

    /// Enforce the custom-CLI invariants the UI also checks, at the durable
    /// persistence boundary (SP-072): unique (case-sensitive) names, a non-empty
    /// base command that is unique and not a reserved built-in token. A duplicate
    /// name would otherwise collapse two providers onto the same `custom:<name>`
    /// routing key.
    pub fn validate_custom(&self) -> Result<(), String> {
        const RESERVED: [&str; 3] = ["codex", "claude", "gemini"];
        let mut names = std::collections::HashSet::new();
        let mut tokens = std::collections::HashSet::new();
        for entry in &self.custom {
            if !names.insert(entry.name.as_str()) {
                return Err(format!("duplicate custom CLI name: {}", entry.name));
            }
            let token = entry.base_command();
            if token.is_empty() {
                return Err(format!("custom CLI '{}' has an empty command", entry.name));
            }
            if RESERVED.contains(&token) {
                return Err(format!("'{token}' is a reserved command"));
            }
            if !tokens.insert(token.to_string()) {
                return Err(format!("duplicate custom base command: {token}"));
            }
        }
        Ok(())
    }

    /// Every enabled provider, built-ins first (in fixed order) then custom
    /// providers in registration order, as routable [`AssistantId`]s.
    pub fn enabled_providers(&self) -> Vec<AssistantId> {
        let mut providers: Vec<AssistantId> = self
            .all()
            .iter()
            .filter(|i| i.enabled)
            .map(|i| i.assistant.clone())
            .collect();
        providers.extend(
            self.custom
                .iter()
                .filter(|entry| entry.enabled)
                .map(|entry| AssistantId::Custom(entry.name.clone())),
        );
        providers
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
        let status = match &id {
            AssistantId::Gemini => self.detect_gemini().await,
            AssistantId::Codex => {
                self.detect_with_auth(AssistantId::Codex, "codex login status").await
            }
            AssistantId::Claude => {
                self.detect_with_auth(AssistantId::Claude, "claude auth status").await
            }
            // Custom CLIs are detected separately (stdin "hello" test); they are
            // never passed to `detect_single`.
            AssistantId::Custom(_) => CliDetectionStatus::NotDetected,
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
        if self.resolver.resolve(id.clone()).await.is_err() {
            return CliDetectionStatus::NotInstalled;
        }

        let run_shell = Arc::clone(&self.run_shell);
        let cmd = auth_cmd.to_string();
        let outcome = tokio::task::spawn_blocking(move || (run_shell)(&cmd, DETECTION_TIMEOUT))
            .await
            .unwrap_or(Err(std::io::Error::other("detection task panicked")));

        match outcome {
            Ok(outcome) => match id {
                AssistantId::Codex => Self::parse_codex_auth(&outcome),
                AssistantId::Claude => Self::parse_claude_auth(&outcome),
                AssistantId::Gemini | AssistantId::Custom(_) => unreachable!(),
            },
            Err(_) => CliDetectionStatus::NotDetected,
        }
    }

    fn parse_codex_auth(outcome: &DetectionRunOutcome) -> CliDetectionStatus {
        if outcome.exit_code != Some(0) {
            return CliDetectionStatus::NotDetected;
        }
        // Try structured JSON first on stdout (forward-compat: same shape as claude auth status).
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&outcome.stdout) {
            if let Some(logged_in) = value.get("loggedIn").and_then(|v| v.as_bool()) {
                return if logged_in {
                    CliDetectionStatus::Available
                } else {
                    CliDetectionStatus::NotAuthenticated
                };
            }
        }
        // Fall back to text matching on combined stdout + stderr.
        // `codex login status` writes its status line to stderr (stdout is empty);
        // checking both streams makes the match stream-agnostic. Negative patterns
        // are checked before positive to avoid "not authenticated" matching the
        // trailing "authenticated" substring.
        let combined = format!("{}\n{}", outcome.stdout, outcome.stderr);
        let lower = combined.to_lowercase();
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
    let (shell, args): (&str, &[&str]) = ("cmd", &["/C", command]);

    #[cfg(not(windows))]
    let (shell, args): (&str, &[&str]) = ("/bin/zsh", &["-lc", command]);

    let child = std::process::Command::new(shell)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    wait_with_timeout(child, timeout)
}

fn wait_with_timeout(
    mut child: std::process::Child,
    timeout: Duration,
) -> std::io::Result<DetectionRunOutcome> {
    use std::io::Read;

    let start = std::time::Instant::now();
    loop {
        match child.try_wait()? {
            Some(exit_status) => {
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    out.read_to_end(&mut stdout)?;
                }
                if let Some(mut err) = child.stderr.take() {
                    err.read_to_end(&mut stderr)?;
                }
                return Ok(DetectionRunOutcome {
                    exit_code: exit_status.code(),
                    stdout: String::from_utf8_lossy(&stdout).into_owned(),
                    stderr: String::from_utf8_lossy(&stderr).into_owned(),
                });
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

    /// Like `shell_runner` but puts content on stderr and leaves stdout empty —
    /// exactly how `codex login status` behaves in practice.
    fn shell_runner_stderr(
        exit_code: Option<i32>,
        stderr: String,
    ) -> DetectShellFn {
        Arc::new(move |_cmd, _timeout| {
            Ok(DetectionRunOutcome {
                exit_code,
                stdout: String::new(),
                stderr: stderr.clone(),
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

    // --- Codex stderr tests (actual codex CLI writes to stderr, not stdout) ---

    #[tokio::test]
    async fn codex_available_when_logged_in_message_on_stderr() {
        // `codex login status` writes "Logged in using ChatGPT" to stderr; stdout is empty.
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner_stderr(Some(0), "Logged in using ChatGPT".to_string()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::Available);
    }

    #[tokio::test]
    async fn codex_not_authenticated_when_not_logged_in_message_on_stderr() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner_stderr(Some(0), "Not logged in. Run 'codex login' first.".to_string()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotAuthenticated);
    }

    // --- Codex JSON-format tests (parse_codex_auth json-first path) ---

    #[tokio::test]
    async fn codex_available_when_json_logged_in_true() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), r#"{"loggedIn":true}"#.to_string()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::Available);
    }

    #[tokio::test]
    async fn codex_not_authenticated_when_json_logged_in_false() {
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), r#"{"loggedIn":false}"#.to_string()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotAuthenticated);
    }

    #[tokio::test]
    async fn codex_not_authenticated_when_output_contains_not_authenticated_substring() {
        // Verifies the negative pattern wins over the embedded "authenticated" substring.
        let detector = detector_with_resolver(
            mock_binary_found(),
            shell_runner(Some(0), "Not authenticated. Run codex login.".to_string()),
        );
        let result = detector.detect_single(AssistantId::Codex).await;
        assert_eq!(result.detected_status, CliDetectionStatus::NotAuthenticated);
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
