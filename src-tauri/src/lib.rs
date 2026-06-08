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
pub mod preferences;
pub mod routing;
pub mod storage;

use preferences::PreferencesStore;
use storage::Store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::AppState::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let store = Store::open(data_dir.join("side-pilot.db"))?;
            let preferences = PreferencesStore::open(data_dir.join("preferences.json"))
                .map_err(std::io::Error::other)?;

            let general = preferences.general_snapshot();
            if let Some(window) = app.get_webview_window("main") {
                window.set_always_on_top(general.always_on_top)?;
                if let Some(pos) = general.startup_position() {
                    window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y))?;
                }
            }

            app.manage(store);
            app.manage(preferences);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::run_adapter,
            commands::run_route,
            commands::retry_route,
            commands::get_provider_preferences,
            commands::update_provider_preferences,
            commands::get_general_preferences,
            commands::update_general_preferences,
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
