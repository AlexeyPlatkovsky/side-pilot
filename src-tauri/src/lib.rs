//! side-pilot Tauri core.
//!
//! Source layout for the Rust side:
//! - [`commands`] — Tauri command handlers exposed to the React front-end (IPC seam).
//! - [`adapters`] — CLI adapter seam (Codex/Claude/Gemini), arriving in SP-008+.
//! - [`storage`] — local SQLite persistence seam, arriving in SP-007.

pub mod adapters;
pub mod commands;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app_version])
        .run(tauri::generate_context!())
        .expect("error while running side-pilot");
}
