# Desktop Platform Scope

side-pilot targets macOS and Windows desktop app packaging. It is not an iOS, Android, mobile web, or general responsive web product unless the user explicitly changes platform scope.

## App Assets

- Keep app icon source assets in `src-tauri/icons/` when they are needed to regenerate desktop outputs.
- Keep desktop-relevant Tauri outputs:
  - macOS: `icon.icns`
  - Windows: `icon.ico`, `StoreLogo.png`, and `Square*Logo.png` assets used for Windows packaging
  - shared PNGs referenced by `src-tauri/tauri.conf.json`
- Do not keep generated `src-tauri/icons/ios/` or `src-tauri/icons/android/` directories unless the user explicitly requests mobile targets.
- If a generator creates mobile assets by default, remove those directories before validation.
- Verify every icon path referenced by `src-tauri/tauri.conf.json` exists.

## Design Variants

- If a worktree gets an assigned dev port, update both Vite and Tauri dev config to the same port.
- Design validation must check the intended desktop window states, especially collapsed bubble and expanded panel.
- Do not optimize layouts for phone or tablet breakpoints at the expense of the desktop floating panel.
