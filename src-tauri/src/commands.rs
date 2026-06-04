//! Tauri command handlers — the typed IPC seam the React UI calls via `invoke`.
//!
//! `run_adapter` (SP-008) is the front-end's entry point into the CLI routing
//! seam: React sends an [`AdapterRequest`] and receives an [`AdapterResult`] or
//! a typed [`AdapterError`]. The command stays thin — it reads managed app
//! state and delegates; all logic lives in the unit-tested adapter layer.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::adapters::{AdapterError, AdapterRegistry, AdapterRequest, AdapterResult};

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

    pub async fn register_run(&self, run_id: String) -> CancellationToken {
        let token = CancellationToken::new();
        self.active_runs.lock().await.insert(run_id, token.clone());
        token
    }

    async fn finish_run(&self, run_id: &str) {
        self.active_runs.lock().await.remove(run_id);
    }

    pub async fn cancel_run(&self, run_id: &str) -> bool {
        let token = self.active_runs.lock().await.remove(run_id);
        match token {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
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
    request: AdapterRequest,
) -> Result<AdapterResult, AdapterError> {
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
    let cancel = state.register_run(run_id.clone()).await;
    let result = state.registry.run(request, cancel).await;
    state.finish_run(&run_id).await;
    result
}

/// Cancel an in-flight adapter run. Returns whether an active run was found.
#[tauri::command]
pub async fn cancel_adapter_run(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<bool, String> {
    Ok(state.cancel_run(&run_id).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_version_is_non_empty() {
        assert!(!app_version().is_empty());
    }

    #[tokio::test]
    async fn app_state_can_cancel_active_run_by_id() {
        let state = AppState::default();
        let token = state.register_run("run-1".to_string()).await;

        assert!(state.cancel_run("run-1").await);
        assert!(token.is_cancelled());
        assert!(!state.cancel_run("run-1").await);
    }
}
