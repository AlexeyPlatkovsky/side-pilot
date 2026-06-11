//! Routing seam.
//!
//! The [`AdapterRegistry`] maps an [`AssistantId`] to its registered
//! [`CliAdapter`] and dispatches an [`AdapterRequest`] to the right one. This is
//! the "thin routing seam" (`docs/idea.md` §MVP Scope): Codex and Claude are
//! registered today, and the seam is shaped to take Gemini next without changing
//! the `run_adapter` command.

use std::collections::HashMap;
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use super::binary::SystemBinaryResolver;
use super::claude::ClaudeAdapter;
use super::codex::CodexAdapter;
use super::contract::{AdapterRequest, AdapterResult};
use super::custom::CustomCliAdapter;
use super::environment::SystemEnvironmentProvider;
use super::error::AdapterError;
use super::gemini::GeminiAdapter;
use super::process::SystemCommandRunner;
use super::{AssistantId, CliAdapter};

/// Registry of CLI adapters keyed by assistant.
///
/// Built-in providers are keyed by their unit [`AssistantId`]. Every
/// [`AssistantId::Custom`] routes to a single shared `custom` adapter (SP-072):
/// custom CLIs are distinguished by the resolved command that travels in the
/// request, not by per-entry registration.
#[derive(Default, Clone)]
pub struct AdapterRegistry {
    adapters: HashMap<AssistantId, Arc<dyn CliAdapter>>,
    custom: Option<Arc<dyn CliAdapter>>,
}

impl AdapterRegistry {
    /// An empty registry.
    pub fn new() -> Self {
        Self {
            adapters: HashMap::new(),
            custom: None,
        }
    }

    /// The production registry, backed by the real binary resolver, command
    /// runner, and environment provider. Codex, Claude, and Gemini are all
    /// registered; the resolver and env provider cache per [`AssistantId`], so a
    /// single instance is shared across adapters. A [`CustomCliAdapter`] drives
    /// every user-registered custom CLI (SP-072).
    pub fn with_default_adapters() -> Self {
        let resolver = Arc::new(SystemBinaryResolver::new());
        let runner = Arc::new(SystemCommandRunner);
        let env_provider = Arc::new(SystemEnvironmentProvider::new());
        let mut registry = Self::new();
        registry.register(Arc::new(CodexAdapter::new(
            resolver.clone(),
            runner.clone(),
            env_provider.clone(),
        )));
        registry.register(Arc::new(ClaudeAdapter::new(
            resolver.clone(),
            runner.clone(),
            env_provider.clone(),
        )));
        registry.register(Arc::new(GeminiAdapter::new(
            resolver,
            runner.clone(),
            env_provider,
        )));
        registry.register_custom(Arc::new(CustomCliAdapter::new(runner)));
        registry
    }

    /// Register an adapter under its own [`CliAdapter::id`].
    pub fn register(&mut self, adapter: Arc<dyn CliAdapter>) {
        self.adapters.insert(adapter.id(), adapter);
    }

    /// Register the single adapter that drives every custom CLI (SP-072).
    pub fn register_custom(&mut self, adapter: Arc<dyn CliAdapter>) {
        self.custom = Some(adapter);
    }

    /// Route a request to the adapter for `request.assistant` and run it.
    ///
    /// A custom assistant routes to the shared custom adapter. An assistant with
    /// no registered adapter is surfaced as [`AdapterError::BinaryNotFound`]:
    /// from the UI's perspective an assistant the app cannot drive is
    /// indistinguishable from one whose binary is unavailable.
    pub async fn run(
        &self,
        request: AdapterRequest,
        cancel: CancellationToken,
    ) -> Result<AdapterResult, AdapterError> {
        let adapter = if request.assistant.is_custom() {
            self.custom.as_ref()
        } else {
            self.adapters.get(&request.assistant)
        };
        match adapter {
            Some(adapter) => adapter.run(request, cancel).await,
            None => Err(AdapterError::BinaryNotFound),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::contract::PermissionMode;
    use async_trait::async_trait;

    fn request(assistant: AssistantId) -> AdapterRequest {
        AdapterRequest {
            assistant,
            prompt: "hi".to_string(),
            working_directory: None,
            model: None,
            reasoning_effort: None,
            permission_mode: PermissionMode::ReadOnly,
            timeout_ms: 1000,
            resume_session_id: None,
            run_id: None,
            custom_command: None,
        }
    }

    /// Minimal stub adapter that records it was called and returns a marker.
    struct StubAdapter {
        id: AssistantId,
    }

    #[async_trait]
    impl CliAdapter for StubAdapter {
        fn id(&self) -> AssistantId {
            self.id.clone()
        }
        async fn run(
            &self,
            req: AdapterRequest,
            _cancel: CancellationToken,
        ) -> Result<AdapterResult, AdapterError> {
            Ok(AdapterResult {
                // Echo the resolved custom command (when present) so routing
                // tests can assert which adapter handled the request.
                assistant_text: req
                    .custom_command
                    .unwrap_or_else(|| "routed".to_string()),
                raw_json: "{}".to_string(),
                native_session_id: None,
                usage: None,
            })
        }
    }

    #[tokio::test]
    async fn routes_to_registered_adapter() {
        let mut registry = AdapterRegistry::new();
        registry.register(Arc::new(StubAdapter {
            id: AssistantId::Codex,
        }));

        let result = registry
            .run(request(AssistantId::Codex), CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(result.assistant_text, "routed");
    }

    #[test]
    fn default_registry_registers_all_three_assistants_and_custom() {
        let registry = AdapterRegistry::with_default_adapters();
        assert!(registry.adapters.contains_key(&AssistantId::Codex));
        assert!(registry.adapters.contains_key(&AssistantId::Claude));
        assert!(registry.adapters.contains_key(&AssistantId::Gemini));
        assert!(registry.custom.is_some(), "custom adapter registered");
    }

    #[tokio::test]
    async fn custom_assistant_routes_to_shared_custom_adapter() {
        let mut registry = AdapterRegistry::new();
        // A built-in stub registered under Custom("") must NOT be used; the
        // dedicated custom slot is what handles any Custom(_) id.
        registry.register_custom(Arc::new(StubAdapter {
            id: AssistantId::Custom(String::new()),
        }));

        let mut req = request(AssistantId::Custom("OpenCode".to_string()));
        req.custom_command = Some("opencode --prompt".to_string());
        let result = registry.run(req, CancellationToken::new()).await.unwrap();
        // The stub echoes the resolved command, proving it received the request.
        assert_eq!(result.assistant_text, "opencode --prompt");
    }

    #[tokio::test]
    async fn custom_assistant_without_registered_custom_adapter_errors_cleanly() {
        let registry = AdapterRegistry::new();
        let err = registry
            .run(
                request(AssistantId::Custom("X".to_string())),
                CancellationToken::new(),
            )
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::BinaryNotFound);
    }

    #[tokio::test]
    async fn unregistered_assistant_errors_cleanly() {
        let mut registry = AdapterRegistry::new();
        registry.register(Arc::new(StubAdapter {
            id: AssistantId::Codex,
        }));

        // Gemini is not registered.
        let err = registry
            .run(request(AssistantId::Gemini), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(err, AdapterError::BinaryNotFound);
    }
}
