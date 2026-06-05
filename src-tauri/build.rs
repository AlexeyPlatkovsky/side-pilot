fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "app_version",
            "run_adapter",
            "cancel_adapter_run",
            "create_session",
            "append_message",
            "read_history",
            "list_sessions",
            "rename_session",
            "delete_session",
            "clear_session",
            "update_codex_session_id",
            "open_external",
        ]),
    ))
    .expect("failed to run Tauri build script")
}
