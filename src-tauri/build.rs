fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "app_version",
            "run_adapter",
            "cancel_adapter_run",
        ]),
    ))
    .expect("failed to run Tauri build script")
}
