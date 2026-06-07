//! Tauri command handlers — the typed IPC seam the React UI calls via `invoke`.
//!
//! `run_adapter` (SP-008) is the front-end's entry point into the CLI routing
//! seam: React sends an [`AdapterRequest`] and receives an [`AdapterResult`] or
//! a typed [`AdapterError`]. The command stays thin — it reads managed app
//! state and delegates; all logic lives in the unit-tested adapter layer.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::adapters::{AdapterError, AdapterRegistry, AdapterRequest, AdapterResult, AssistantId};
use crate::preferences::{PreferencesError, PreferencesStore, ProviderPreferences};
use crate::routing::{
    execute_route_with_preferences, retry_result, ProviderRunOutcome, RouteRequest, RouteRunResult,
};
use crate::storage::{Message, NewMessage, Session, StorageError, Store};

pub struct AppState {
    registry: AdapterRegistry,
    active_runs: Mutex<HashMap<String, CancellationToken>>,
    next_run: AtomicU64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            registry: AdapterRegistry::with_default_adapters(),
            active_runs: Mutex::new(HashMap::new()),
            next_run: AtomicU64::new(1),
        }
    }
}

impl AppState {
    fn next_run_id(&self) -> String {
        let id = self.next_run.fetch_add(1, Ordering::Relaxed);
        format!("adapter-run-{id}")
    }

    pub fn register_run(&self, run_id: String) -> CancellationToken {
        let token = CancellationToken::new();
        self.active_runs
            .lock()
            .expect("active run mutex poisoned")
            .insert(run_id, token.clone());
        token
    }

    fn finish_run(&self, run_id: &str) {
        self.active_runs
            .lock()
            .expect("active run mutex poisoned")
            .remove(run_id);
    }

    pub async fn cancel_run(&self, run_id: &str) -> bool {
        let token = self
            .active_runs
            .lock()
            .expect("active run mutex poisoned")
            .remove(run_id);
        match token {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }

    #[cfg(test)]
    fn active_run_count(&self) -> usize {
        self.active_runs
            .lock()
            .expect("active run mutex poisoned")
            .len()
    }
}

struct ActiveRunGuard<'a> {
    state: &'a AppState,
    run_id: String,
}

impl Drop for ActiveRunGuard<'_> {
    fn drop(&mut self) {
        self.state.finish_run(&self.run_id);
    }
}

/// Returns the running application version (from `Cargo.toml`).
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Route a prompt to its assistant's CLI adapter and return the typed result.
///
/// The front-end calls `invoke("run_adapter", { request })`. If the request
/// carries `runId`, the front-end can pass that same id to `cancel_adapter_run`.
#[tauri::command]
pub async fn run_adapter(
    state: State<'_, AppState>,
    preferences: State<'_, PreferencesStore>,
    mut request: AdapterRequest,
) -> Result<AdapterResult, AdapterError> {
    preferences.snapshot().apply_to_request(&mut request);
    run_adapter_with_state(&state, request).await
}

async fn run_adapter_with_state(
    state: &AppState,
    request: AdapterRequest,
) -> Result<AdapterResult, AdapterError> {
    let run_id = request
        .run_id
        .clone()
        .unwrap_or_else(|| state.next_run_id());
    let cancel = state.register_run(run_id.clone());
    let _active_run = ActiveRunGuard { state, run_id };
    let result = state.registry.run(request, cancel).await;
    result
}

/// Route a prompt to one provider or to all active providers (SP-016).
///
/// Persists the user prompt, sends each provider only the context it has not yet
/// seen (app-owned transcript replay, §6), dispatches `All` routes concurrently,
/// persists each successful response, and records `message_provider_sends`. The
/// `Result` error surfaces storage failures; per-provider adapter failures are
/// returned inside each [`ProviderRunOutcome`](crate::routing::ProviderRunOutcome).
#[tauri::command]
pub async fn run_route(
    state: State<'_, AppState>,
    store: State<'_, Store>,
    preferences: State<'_, PreferencesStore>,
    request: RouteRequest,
) -> Result<RouteRunResult, StorageError> {
    run_route_with_state(&state, &store, &preferences, request).await
}

async fn run_route_with_state(
    state: &AppState,
    store: &Store,
    preferences: &PreferencesStore,
    request: RouteRequest,
) -> Result<RouteRunResult, StorageError> {
    // Register one cancellation token per provider slot so `cancel_adapter_run`
    // can target an in-flight provider; the ids are released once the route
    // resolves (mirrors `ActiveRunGuard` for the single-run path). A `&mut Vec`
    // capture (not `RefCell`) keeps the command future `Send`/`Sync`.
    let mut registered: Vec<String> = Vec::new();
    let result = {
        let registered = &mut registered;
        let make_cancel = |provider: AssistantId| {
            let run_id = format!("{}-{}", state.next_run_id(), provider.as_str());
            registered.push(run_id.clone());
            state.register_run(run_id)
        };
        let snapshot = preferences.snapshot();
        execute_route_with_preferences(store, &state.registry, &snapshot, request, make_cancel)
            .await
    };

    for run_id in registered {
        state.finish_run(&run_id);
    }
    result
}

/// Retry a prompt for a specific provider after a failure (e.g. timeout).
/// Deletes the old error message, dispatches fresh, and returns the outcome.
#[tauri::command]
pub async fn retry_route(
    state: State<'_, AppState>,
    store: State<'_, Store>,
    preferences: State<'_, PreferencesStore>,
    session_id: String,
    error_message_id: String,
    provider: AssistantId,
    prompt: String,
) -> Result<ProviderRunOutcome, StorageError> {
    let run_id = format!("{}-{}", state.next_run_id(), provider.as_str());
    let cancel = state.register_run(run_id.clone());
    let _active_run = ActiveRunGuard {
        state: &state,
        run_id,
    };
    let snapshot = preferences.snapshot();
    retry_result(
        &store,
        &state.registry,
        &snapshot,
        session_id,
        error_message_id,
        provider,
        prompt,
        cancel,
    )
    .await
}

/// Return the in-memory provider preference snapshot.
#[tauri::command]
pub fn get_provider_preferences(preferences: State<'_, PreferencesStore>) -> ProviderPreferences {
    preferences.snapshot()
}

/// Validate, atomically persist, and immediately activate provider preferences.
#[tauri::command]
pub fn update_provider_preferences(
    preferences: State<'_, PreferencesStore>,
    value: ProviderPreferences,
) -> Result<ProviderPreferences, PreferencesError> {
    preferences.update(value)
}

/// Cancel an in-flight adapter run. Returns whether an active run was found.
#[tauri::command]
pub async fn cancel_adapter_run(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<bool, String> {
    Ok(state.cancel_run(&run_id).await)
}

// --- Local session/message store (SP-007) -------------------------------
//
// These commands are the front-end's typed seam into the SQLite history store.
// The store is the display/history source of truth (§6); the work is fast and
// synchronous, so each command locks the connection, runs one operation, and
// returns a typed [`StorageError`] the UI can branch on.

/// Create a new local chat session.
#[tauri::command]
pub fn create_session(
    store: State<'_, Store>,
    title: Option<String>,
) -> Result<Session, StorageError> {
    store.create_session(title)
}

/// Append a message to a session, returning the persisted row.
#[tauri::command]
pub fn append_message(
    store: State<'_, Store>,
    message: NewMessage,
) -> Result<Message, StorageError> {
    store.append_message(message)
}

/// Read a session's messages in send order.
#[tauri::command]
pub fn read_history(
    store: State<'_, Store>,
    session_id: String,
) -> Result<Vec<Message>, StorageError> {
    store.read_history(&session_id)
}

/// List all sessions, most recently updated first.
#[tauri::command]
pub fn list_sessions(store: State<'_, Store>) -> Result<Vec<Session>, StorageError> {
    store.list_sessions()
}

/// Rename a session (SP-050). Does not reorder the chat list.
#[tauri::command]
pub fn rename_session(
    store: State<'_, Store>,
    session_id: String,
    title: Option<String>,
) -> Result<Session, StorageError> {
    store.rename_session(&session_id, title)
}

/// Delete a session and all of its messages (SP-050, cascade).
#[tauri::command]
pub fn delete_session(store: State<'_, Store>, session_id: String) -> Result<(), StorageError> {
    store.delete_session(&session_id)
}

/// Clear a session's messages and native resume id, keeping the empty chat (SP-051).
#[tauri::command]
pub fn clear_session(store: State<'_, Store>, session_id: String) -> Result<Session, StorageError> {
    store.clear_session(&session_id)
}

/// Record the native Codex session id for a local session (resume, §6).
#[tauri::command]
pub fn update_codex_session_id(
    store: State<'_, Store>,
    session_id: String,
    codex_session_id: String,
) -> Result<(), StorageError> {
    store.update_codex_session_id(&session_id, &codex_session_id)
}

/// Open an assistant-provided link in the OS default browser instead of the
/// app's WebView. Unsafe schemes (`javascript:`, `file:`, …) are rejected by
/// [`links::open_external`], so the panel never navigates away from itself.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), crate::links::OpenError> {
    crate::links::open_external(&url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;

    use crate::adapters::{AssistantId, CliAdapter, PermissionMode};
    use async_trait::async_trait;

    fn request(run_id: &str) -> AdapterRequest {
        AdapterRequest {
            assistant: AssistantId::Codex,
            prompt: "hi".to_string(),
            working_directory: None,
            model: None,
            reasoning_effort: None,
            permission_mode: PermissionMode::ReadOnly,
            timeout_ms: 1000,
            resume_session_id: None,
            run_id: Some(run_id.to_string()),
        }
    }

    struct StaticAdapter {
        result: Result<AdapterResult, AdapterError>,
    }

    #[async_trait]
    impl CliAdapter for StaticAdapter {
        fn id(&self) -> AssistantId {
            AssistantId::Codex
        }

        async fn run(
            &self,
            _req: AdapterRequest,
            _cancel: CancellationToken,
        ) -> Result<AdapterResult, AdapterError> {
            self.result.clone()
        }
    }

    struct PendingAdapter;

    #[async_trait]
    impl CliAdapter for PendingAdapter {
        fn id(&self) -> AssistantId {
            AssistantId::Codex
        }

        async fn run(
            &self,
            _req: AdapterRequest,
            cancel: CancellationToken,
        ) -> Result<AdapterResult, AdapterError> {
            cancel.cancelled().await;
            Ok(AdapterResult {
                assistant_text: "cancelled".to_string(),
                raw_json: "{}".to_string(),
                native_session_id: None,
                usage: None,
            })
        }
    }

    fn state_with(adapter: Arc<dyn CliAdapter>) -> AppState {
        let mut registry = AdapterRegistry::new();
        registry.register(adapter);
        AppState {
            registry,
            active_runs: Default::default(),
            next_run: AtomicU64::new(1),
        }
    }

    #[test]
    fn app_version_is_non_empty() {
        assert!(!app_version().is_empty());
    }

    #[tokio::test]
    async fn app_state_can_cancel_active_run_by_id() {
        let state = AppState::default();
        let token = state.register_run("run-1".to_string());

        assert!(state.cancel_run("run-1").await);
        assert!(token.is_cancelled());
        assert!(!state.cancel_run("run-1").await);
    }

    #[tokio::test]
    async fn run_adapter_removes_active_run_after_success() {
        let state = state_with(Arc::new(StaticAdapter {
            result: Ok(AdapterResult {
                assistant_text: "ok".to_string(),
                raw_json: "{}".to_string(),
                native_session_id: None,
                usage: None,
            }),
        }));

        let result = run_adapter_with_state(&state, request("run-success"))
            .await
            .unwrap();

        assert_eq!(result.assistant_text, "ok");
        assert!(!state.cancel_run("run-success").await);
    }

    #[tokio::test]
    async fn run_adapter_removes_active_run_after_error() {
        let state = state_with(Arc::new(StaticAdapter {
            result: Err(AdapterError::BinaryNotFound),
        }));

        let err = run_adapter_with_state(&state, request("run-error"))
            .await
            .unwrap_err();

        assert_eq!(err, AdapterError::BinaryNotFound);
        assert!(!state.cancel_run("run-error").await);
    }

    #[tokio::test]
    async fn run_route_persists_prompt_and_releases_run_tokens() {
        let state = state_with(Arc::new(StaticAdapter {
            result: Ok(AdapterResult {
                assistant_text: "pong".to_string(),
                raw_json: "{}".to_string(),
                native_session_id: None,
                usage: None,
            }),
        }));
        let store = Store::in_memory().unwrap();
        let preferences = PreferencesStore::open(
            std::env::temp_dir().join("side-pilot-command-test-preferences.json"),
        )
        .unwrap();
        let session = store.create_session(None).unwrap();

        let result = run_route_with_state(
            &state,
            &store,
            &preferences,
            RouteRequest {
                session_id: session.id.clone(),
                route: crate::routing::Route::Single {
                    provider: AssistantId::Codex,
                },
                prompt: "ping".to_string(),
                active_providers: vec![],
                timeout_ms: 1000,
            },
        )
        .await
        .unwrap();

        assert_eq!(result.user_message.content, "ping");
        assert_eq!(result.outcomes.len(), 1);
        assert_eq!(result.outcomes[0].message.as_ref().unwrap().content, "pong");
        // Per-provider run tokens were released once the route resolved.
        assert_eq!(state.active_run_count(), 0);
    }

    #[tokio::test]
    async fn run_adapter_removes_active_run_when_future_is_dropped() {
        let state = Arc::new(state_with(Arc::new(PendingAdapter)));
        let task_state = Arc::clone(&state);
        let handle =
            tokio::spawn(
                async move { run_adapter_with_state(&task_state, request("run-drop")).await },
            );
        loop {
            if state.active_run_count() == 1 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }

        handle.abort();
        let _ = handle.await;

        assert!(!state.cancel_run("run-drop").await);
    }
}
