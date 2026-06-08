# Validation Context — SP-037 Bug Fixes

## Touched Layers

**Rust core:**
- `src-tauri/src/lib.rs` — Apply always-on-top and window position at startup from general preferences
- `src-tauri/src/preferences.rs` — Added `startup_position()` method to `GeneralPreferences`, with 3 new tests

**Frontend:**
- `src/components/Bubble.tsx` — Window move tracking: debounced position save to `lastKnownPosition`, skipped for `inertChatApi`
- `src/components/GeneralSettings.tsx` — i18n labels, custom language dropdown (current → divider → list)
- `src/components/GeneralSettings.test.tsx` — Updated to 11 tests (i18n, dropdown interaction, close behavior)
- `src/i18n/translations.ts` (NEW) — en/ru translations for GeneralSettings labels
- `src/i18n/useI18n.ts` (NEW) — React hook wrapping locale-aware translation
- `src/i18n/useI18n.test.ts` (NEW) — 3 tests for English, Russian, fallback
- `src/styles.css` — Language dropdown styles (lang-select, menu, options)
- `vitest.setup.ts` — Global mock for @tauri-apps/api/window

## Bugs Fixed
1. Window position not applied on startup — now reads general prefs in `lib.rs setup`, calls `set_position`
2. Always-on-top not applied on startup — now calls `set_always_on_top` in `lib.rs setup`
3. Language switcher does nothing — i18n infrastructure with translations, custom dropdown

## Required Validation Commands
1. `npm run test`
2. `npm run build`
3. `cargo nextest run --manifest-path src-tauri/Cargo.toml`
4. `cargo build --manifest-path src-tauri/Cargo.toml`
5. `npx tsc --noEmit`
