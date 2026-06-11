//! Integration tests for the store + adapter-registry pipeline.
//!
//! These tests verify that the storage layer, adapter registry, and routing
//! machinery integrate correctly when wired together — the same composition
//! the Tauri commands use at runtime. All CLI adapters are stubbed so no real
//! subprocess is spawned.

use std::sync::Arc;

use side_pilot_lib::adapters::{
    AdapterRegistry, AdapterRequest, AdapterResult, AssistantId, CliAdapter, PermissionMode,
};
use side_pilot_lib::storage::{NewMessage, Sender, Store};

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
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
    ) -> Result<AdapterResult, side_pilot_lib::adapters::AdapterError> {
        Ok(AdapterResult {
            assistant_text: format!("echo: {}", req.prompt),
            raw_json: r#"{"echoed":true}"#.to_string(),
            native_session_id: Some(format!("stub-{}", self.id.as_str())),
            usage: None,
        })
    }
}

fn make_registry() -> AdapterRegistry {
    let mut registry = AdapterRegistry::new();
    registry.register(Arc::new(StubAdapter {
        id: AssistantId::Codex,
    }));
    registry.register(Arc::new(StubAdapter {
        id: AssistantId::Claude,
    }));
    registry.register(Arc::new(StubAdapter {
        id: AssistantId::Gemini,
    }));
    registry
}

#[tokio::test]
async fn store_and_registry_integration_full_roundtrip() {
    let store = Store::in_memory().expect("in-memory store opens");
    let registry = make_registry();

    let session = store
        .create_session(Some("Integration test".to_string()))
        .expect("session created");

    store
        .append_message(NewMessage {
            session_id: session.id.clone(),
            sender: Sender::User,
            assistant_id: None,
            model: None,
            reasoning_effort: None,
            content: "Hello from integration test".to_string(),
            raw_json: None,
        })
        .expect("user message appended");

    let result = registry
        .run(
            AdapterRequest {
                assistant: AssistantId::Codex,
                prompt: "Hello from integration test".to_string(),
                working_directory: None,
                model: None,
                reasoning_effort: None,
                permission_mode: PermissionMode::ReadOnly,
                timeout_ms: 5000,
                resume_session_id: None,
                run_id: Some("integration-run-1".to_string()),
                custom_command: None,
            },
            CancellationToken::new(),
        )
        .await
        .expect("adapter run succeeds");

    assert_eq!(result.assistant_text, "echo: Hello from integration test");
    assert_eq!(result.native_session_id, Some("stub-codex".to_string()));

    store
        .append_message(NewMessage {
            session_id: session.id.clone(),
            sender: Sender::Assistant,
            assistant_id: Some("Codex".to_string()),
            model: None,
            reasoning_effort: None,
            content: result.assistant_text.clone(),
            raw_json: Some(result.raw_json.clone()),
        })
        .expect("assistant message appended");

    let history = store
        .read_history(&session.id)
        .expect("history read");
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].sender, Sender::User);
    assert_eq!(history[1].sender, Sender::Assistant);
    assert_eq!(history[1].content, "echo: Hello from integration test");
}

#[tokio::test]
async fn all_three_registered_adapters_respond() {
    let registry = make_registry();
    let cancel = CancellationToken::new();

    for id in [AssistantId::Codex, AssistantId::Claude, AssistantId::Gemini] {
        let result = registry
            .run(
                AdapterRequest {
                    assistant: id.clone(),
                    prompt: format!("test {}", id.as_str()),
                    working_directory: None,
                    model: None,
                    reasoning_effort: None,
                    permission_mode: PermissionMode::ReadOnly,
                    timeout_ms: 5000,
                    resume_session_id: None,
                    run_id: None,
                    custom_command: None,
                },
                cancel.clone(),
            )
            .await
            .unwrap_or_else(|_| panic!("{} adapter runs", id.as_str()));

        assert!(result.assistant_text.contains("test"));
    }
}

#[tokio::test]
async fn store_list_and_delete_sessions_integrity() {
    let store = Store::in_memory().expect("in-memory store opens");

    let s1 = store.create_session(Some("Session 1".to_string())).unwrap();
    let s2 = store.create_session(Some("Session 2".to_string())).unwrap();
    let s3 = store.create_session(None).unwrap();

    let sessions = store.list_sessions().unwrap();
    assert_eq!(sessions.len(), 3);

    store.delete_session(&s2.id).unwrap();

    let sessions = store.list_sessions().unwrap();
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().any(|s| s.id == s1.id));
    assert!(sessions.iter().any(|s| s.id == s3.id));
    assert!(!sessions.iter().any(|s| s.id == s2.id));
}
