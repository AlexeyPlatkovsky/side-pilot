//! Tauri command handlers — the typed IPC seam the React UI calls via `invoke`.
//!
//! The real `run_adapter` command (SP-008) lands here once the CLI routing seam
//! exists. For the scaffold this exposes only a trivial version probe so the
//! front-end ↔ core round-trip is wired and testable end to end.

/// Returns the running application version (from `Cargo.toml`).
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_version_is_non_empty() {
        assert!(!app_version().is_empty());
    }
}
