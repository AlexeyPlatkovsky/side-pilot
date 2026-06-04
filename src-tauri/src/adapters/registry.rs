//! Routing seam.
//!
//! The [`AdapterRegistry`] maps an [`AssistantId`] to its registered
//! [`CliAdapter`] and dispatches an [`AdapterRequest`] to the right one. This is
//! the "thin routing seam" of the MVP (`docs/idea.md` §MVP Scope): only Codex is
//! registered today, but the seam is shaped to take Claude/Gemini later without
//! changing the `run_adapter` command.

use std::collections::HashMap;
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use super::binary::SystemBinaryResolver;
use super::codex::CodexAdapter;
use super::contract::{AdapterRequest, AdapterResult};
use super::environment::SystemEnvironmentProvider;
use super::error::AdapterError;
use super::process::SystemCommandRunner;
use super::{AssistantId, CliAdapter};

/// Registry of CLI adapters keyed by assistant.
#[derive(Default, Clone)]
pub struct AdapterRegistry {
    adapters: HashMap<AssistantId, Arc<dyn CliAdapter>>,
}

impl AdapterRegistry {
    /// An empty registry.
    pub fn new() -> Self {
        Self {
            adapters: HashMap::new(),
        }
    }

    /// The production registry: a Codex adapter backed by the real binary
    /// resolver and command runner. The only registered adapter in the MVP.
    pub fn with_default_adapters() -> Self {
        let resolver = Arc::new(SystemBinaryResolver::new());
        let runner = Arc::new(SystemCommandRunner);
        let env_provider = Arc::new(SystemEnvironmentProvider::new());
        let mut registry = Self::new();
        registry.register(Arc::new(CodexAdapter::new(resolver, runner, env_provider)));
        registry
    }

    /// Register an adapter under its own [`CliAdapter::id`].
    pub fn register(&mut self, adapter: Arc<dyn CliAdapter>) {
        self.adapters.insert(adapter.id(), adapter);
    }

    /// Route a request to the adapter for `request.assistant` and run it.
    ///
    /// An assistant with no registered adapter is surfaced as
    /// [`AdapterError::BinaryNotFound`]: from the UI's perspective an assistant
    /// the app cannot drive is indistinguishable from one whose binary is
    /// unavailable. (The MVP only registers Codex.)
    pub async fn run(
        &self,
        request: AdapterRequest,
        cancel: CancellationToken,
    ) -> Result<AdapterResult, AdapterError> {
        match self.adapters.get(&request.assistant) {
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
        }
    }

    /// Minimal stub adapter that records it was called and returns a marker.
    struct StubAdapter {
        id: AssistantId,
    }

    #[async_trait]
    impl CliAdapter for StubAdapter {
        fn id(&self) -> AssistantId {
            self.id
        }
        async fn run(
            &self,
            _req: AdapterRequest,
            _cancel: CancellationToken,
        ) -> Result<AdapterResult, AdapterError> {
            Ok(AdapterResult {
                assistant_text: "routed".to_string(),
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
