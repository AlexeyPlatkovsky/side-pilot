//! side-pilot Tauri core.
//!
//! Source layout for the Rust side:
//! - [`commands`] — Tauri command handlers exposed to the React front-end (IPC seam).
//! - [`adapters`] — CLI adapter seam (Codex/Claude/Gemini); the routing seam and
//!   Codex adapter land in SP-008.
//! - [`storage`] — local SQLite persistence for chat sessions and messages (SP-007).

use tauri::Manager;

pub mod adapters;
pub mod commands;
pub mod links;
pub mod storage;

use storage::Store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::AppState::default())
        .setup(|app| {
            // The chat history DB lives in the per-user app data directory so it
            // survives restarts and stays out of the (read-only) app bundle.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let store = Store::open(data_dir.join("side-pilot.db"))?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::run_adapter,
            commands::cancel_adapter_run,
            commands::create_session,
            commands::append_message,
            commands::read_history,
            commands::list_sessions,
            commands::rename_session,
            commands::delete_session,
            commands::clear_session,
            commands::update_codex_session_id,
            commands::open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running side-pilot");
}
