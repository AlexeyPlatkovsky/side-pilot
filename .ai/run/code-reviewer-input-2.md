# Code Review — SP-037 Bug Fixes

## Three bugs fixed
1. **Window position + always-on-top not applied on startup** — lib.rs setup now reads general prefs and applies them
2. **No window position tracking** — Bubble.tsx debounced onMoved → saves lastKnownPosition every 1s after move stops
3. **Language switcher does nothing** — Created i18n infrastructure (translations.ts, useI18n hook), custom dropdown (current lang → divider → alphabetical list)

## Diff (key files only)
```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 6cabcc5..787e3a8 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -23,13 +23,20 @@ pub fn run() {
     tauri::Builder::default()
         .manage(commands::AppState::default())
         .setup(|app| {
-            // The chat history DB lives in the per-user app data directory so it
-            // survives restarts and stays out of the (read-only) app bundle.
             let data_dir = app.path().app_data_dir()?;
             std::fs::create_dir_all(&data_dir)?;
             let store = Store::open(data_dir.join("side-pilot.db"))?;
             let preferences = PreferencesStore::open(data_dir.join("preferences.json"))
                 .map_err(std::io::Error::other)?;
+
+            let general = preferences.general_snapshot();
+            if let Some(window) = app.get_webview_window("main") {
+                window.set_always_on_top(general.always_on_top)?;
+                if let Some(pos) = general.startup_position() {
+                    window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y))?;
+                }
+            }
+
             app.manage(store);
             app.manage(preferences);
             Ok(())
@@ -41,6 +48,8 @@ pub fn run() {
             commands::retry_route,
             commands::get_provider_preferences,
             commands::update_provider_preferences,
+            commands::get_general_preferences,
+            commands::update_general_preferences,
             commands::cancel_adapter_run,
             commands::create_session,
             commands::append_message,
diff --git a/src-tauri/src/preferences.rs b/src-tauri/src/preferences.rs
index 6f9cea3..57708a8 100644
--- a/src-tauri/src/preferences.rs
+++ b/src-tauri/src/preferences.rs
@@ -145,9 +145,85 @@ fn parse_provider(value: Option<&Value>) -> Option<ProviderPreference> {
     preference.normalized("provider").ok()
 }
 
+#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
+#[serde(rename_all = "camelCase")]
+#[ts(export, export_to = "../../src/chat/generated/")]
+pub struct Position {
+    pub x: i32,
+    pub y: i32,
+}
+
+#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
+#[serde(rename_all = "camelCase")]
+#[ts(export, export_to = "../../src/chat/generated/")]
+pub enum PositionMode {
+    Pin,
+    TrackLast,
+}
+
+impl Default for PositionMode {
+    fn default() -> Self {
+        Self::TrackLast
+    }
+}
+
+#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
+#[serde(rename_all = "camelCase")]
+#[ts(export, export_to = "../../src/chat/generated/")]
+pub struct GeneralPreferences {
+    pub always_on_top: bool,
+    pub position_mode: PositionMode,
+    pub pinned_position: Option<Position>,
+    pub last_known_position: Option<Position>,
+    pub language: String,
+}
+
+impl Default for GeneralPreferences {
+    fn default() -> Self {
+        Self {
+            always_on_top: true,
+            position_mode: PositionMode::default(),
+            pinned_position: None,
+            last_known_position: None,
+            language: "en".to_string(),
+        }
+    }
+}
+
+impl GeneralPreferences {
+    fn normalized(self) -> Result<Self, PreferencesError> {
+        match self.language.as_str() {
+            "en" | "ru" => {}
+            other => {
+                return Err(PreferencesError::Validation {
+                    detail: format!("unsupported language: {other}"),
+                });
+            }
+        }
+        Ok(self)
+    }
+
+    pub fn startup_position(&self) -> Option<Position> {
+        match self.position_mode {
+            PositionMode::Pin => self.pinned_position,
+            PositionMode::TrackLast => self.last_known_position,
+        }
+    }
+}
+
+#[derive(Debug, Clone, Serialize)]
+#[serde(rename_all = "camelCase")]
+struct PersistedPreferences {
+    codex: ProviderPreference,
+    claude: ProviderPreference,
+    gemini: ProviderPreference,
+    general: GeneralPreferences,
+}
+
 pub struct PreferencesStore {
     path: PathBuf,
-    snapshot: Mutex<ProviderPreferences>,
+    provider_snapshot: Mutex<ProviderPreferences>,
+    general_snapshot: Mutex<GeneralPreferences>,
     replace_file: ReplaceFile,
 }
 
@@ -161,12 +237,25 @@ impl PreferencesStore {
         replace_file: ReplaceFile,
     ) -> Result<Self, PreferencesError> {
         let path = path.as_ref().to_path_buf();
-        let snapshot = match fs::read_to_string(&path) {
-            Ok(contents) => serde_json::from_str::<Value>(&contents)
-                .map(ProviderPreferences::from_partial_json)
-                .unwrap_or_default(),
+        let (provider, general) = match fs::read_to_string(&path) {
+            Ok(contents) => {
+                let parsed = serde_json::from_str::<Value>(&contents);
+                let provider = parsed
+                    .as_ref()
+                    .ok()
+                    .map(|v| ProviderPreferences::from_partial_json(v.clone()))
+                    .unwrap_or_default();
+                let general = parsed
+                    .as_ref()
+                    .ok()
+                    .and_then(|v| v.get("general"))
+                    .and_then(|g| serde_json::from_value::<GeneralPreferences>(g.clone()).ok())
+                    .and_then(|g| g.normalized().ok())
+                    .unwrap_or_default();
+                (provider, general)
+            }
             Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
-                ProviderPreferences::default()
+                (ProviderPreferences::default(), GeneralPreferences::default())
             }
             Err(error) => {
                 return Err(PreferencesError::Persistence {
@@ -176,27 +265,40 @@ impl PreferencesStore {
         };
         Ok(Self {
             path,
-            snapshot: Mutex::new(snapshot),
+            provider_snapshot: Mutex::new(provider),
+            general_snapshot: Mutex::new(general),
             replace_file,
         })
     }
 
     pub fn snapshot(&self) -> ProviderPreferences {
-        self.snapshot
+        self.provider_snapshot
             .lock()
             .expect("preferences snapshot lock poisoned")
             .clone()
     }
 
+    pub fn general_snapshot(&self) -> GeneralPreferences {
+        self.general_snapshot
+            .lock()
+            .expect("general preferences snapshot lock poisoned")
+            .clone()
+    }
+
     pub fn update(
         &self,
         preferences: ProviderPreferences,
     ) -> Result<ProviderPreferences, PreferencesError> {
         let preferences = preferences.normalized()?;
-        let mut snapshot = self
-            .snapshot
+        let mut provider_snapshot = self
+            .provider_snapshot
             .lock()
             .expect("preferences snapshot lock poisoned");
+        let general = self
+            .general_snapshot
+            .lock()
+            .expect("general preferences snapshot lock poisoned")
+            .clone();
         let parent = self
             .path
             .parent()
@@ -207,7 +309,13 @@ impl PreferencesStore {
             detail: format!("failed to create app data: {error}"),
         })?;
         let temp_path = parent.join(format!(".preferences-{}.tmp", uuid::Uuid::new_v4()));
-        let bytes = serde_json::to_vec_pretty(&preferences).map_err(|error| {
+        let persisted = PersistedPreferences {
+            codex: preferences.codex.clone(),
+            claude: preferences.claude.clone(),
+            gemini: preferences.gemini.clone(),
+            general,
+        };
+        let bytes = serde_json::to_vec_pretty(&persisted).map_err(|error| {
             PreferencesError::Persistence {
                 detail: format!("failed to serialize preferences: {error}"),
             }
@@ -228,9 +336,64 @@ impl PreferencesStore {
                 detail: format!("failed to replace preferences: {error}"),
             });
         }
-        *snapshot = preferences.clone();
+        *provider_snapshot = preferences.clone();
         Ok(preferences)
     }
+
+    pub fn update_general(
+        &self,
+        general: GeneralPreferences,
+    ) -> Result<GeneralPreferences, PreferencesError> {
+        let general = general.normalized()?;
+        let mut general_snapshot = self
+            .general_snapshot
+            .lock()
+            .expect("general preferences snapshot lock poisoned");
+        let provider = self
+            .provider_snapshot
+            .lock()
+            .expect("preferences snapshot lock poisoned")
+            .clone();
+        let parent = self
+            .path
+            .parent()
+            .ok_or_else(|| PreferencesError::Persistence {
+                detail: "preferences path has no parent directory".to_string(),
+            })?;
+        fs::create_dir_all(parent).map_err(|error| PreferencesError::Persistence {
+            detail: format!("failed to create app data: {error}"),
+        })?;
+        let temp_path = parent.join(format!(".preferences-{}.tmp", uuid::Uuid::new_v4()));
+        let persisted = PersistedPreferences {
+            codex: provider.codex,
+            claude: provider.claude,
+            gemini: provider.gemini,
+            general: general.clone(),
+        };
+        let bytes = serde_json::to_vec_pretty(&persisted).map_err(|error| {
+            PreferencesError::Persistence {
+                detail: format!("failed to serialize preferences: {error}"),
+            }
+        })?;
+        let mut temp =
+            fs::File::create(&temp_path).map_err(|error| PreferencesError::Persistence {
+                detail: format!("failed to create preferences temp file: {error}"),
+            })?;
+        if let Err(error) = temp.write_all(&bytes).and_then(|_| temp.sync_all()) {
+            fs::remove_file(&temp_path).ok();
+            return Err(PreferencesError::Persistence {
+                detail: format!("failed to write preferences: {error}"),
+            });
+        }
+        if let Err(error) = (self.replace_file)(&temp_path, &self.path) {
+            fs::remove_file(&temp_path).ok();
+            return Err(PreferencesError::Persistence {
+                detail: format!("failed to replace preferences: {error}"),
+            });
+        }
+        *general_snapshot = general.clone();
+        Ok(general)
+    }
 }
 
 #[cfg(not(windows))]
@@ -542,4 +705,214 @@ mod tests {
             run_id: None,
         }
     }
+
+    // --- GeneralPreferences tests ---
+
+    #[test]
+    fn general_preferences_defaults_are_fixed() {
+        let general = GeneralPreferences::default();
+
+        assert!(general.always_on_top);
+        assert_eq!(general.position_mode, PositionMode::TrackLast);
+        assert_eq!(general.pinned_position, None);
+        assert_eq!(general.last_known_position, None);
+        assert_eq!(general.language, "en");
+    }
+
+    #[test]
+    fn general_preferences_rejects_invalid_language() {
+        let mut general = GeneralPreferences::default();
+        general.language = "de".to_string();
+
+        let err = general.normalized().unwrap_err();
+        assert!(matches!(err, PreferencesError::Validation { .. }));
+    }
+
+    #[test]
+    fn accepts_en_and_ru_languages() {
+        for lang in ["en", "ru"] {
+            let mut general = GeneralPreferences::default();
+            general.language = lang.to_string();
+            assert!(general.normalized().is_ok());
+        }
+    }
+
+    #[test]
+    fn general_preferences_persists_and_reads_back() {
+        let path = temp_file();
+        let store = PreferencesStore::open(&path).unwrap();
+
+        let mut general = GeneralPreferences::default();
+        general.always_on_top = false;
+        general.language = "ru".to_string();
+        general.pinned_position = Some(Position { x: 100, y: 200 });
+
+        let saved = store.update_general(general).unwrap();
+
+        assert!(!saved.always_on_top);
+        assert_eq!(saved.language, "ru");
+        assert_eq!(saved.pinned_position, Some(Position { x: 100, y: 200 }));
+        assert_eq!(store.general_snapshot(), saved);
+
+        let reopened = PreferencesStore::open(&path).unwrap();
+        assert_eq!(reopened.general_snapshot(), saved);
+        std::fs::remove_dir_all(path.parent().unwrap()).ok();
+    }
+
+    #[test]
+    fn general_persists_alongside_provider_without_corruption() {
+        let path = temp_file();
+        let store = PreferencesStore::open(&path).unwrap();
+
+        let mut provider = store.snapshot();
+        provider.codex.model = "custom-model".to_string();
+        store.update(provider).unwrap();
+
+        let mut general = GeneralPreferences::default();
+        general.language = "ru".to_string();
+        store.update_general(general).unwrap();
+
+        let reopened = PreferencesStore::open(&path).unwrap();
+        assert_eq!(reopened.snapshot().codex.model, "custom-model");
+        assert_eq!(reopened.general_snapshot().language, "ru");
+        std::fs::remove_dir_all(path.parent().unwrap()).ok();
+    }
+
+    #[test]
+    fn old_preferences_file_without_general_key_uses_default_general() {
+        let path = temp_file();
+        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
+        std::fs::write(
+            &path,
+            r#"{"codex": {"model": "old-model", "reasoning": "low"}, "claude": {"model": "haiku", "reasoning": "low"}, "gemini": {"model": "gemini-3-flash-preview", "reasoning": "none"}}"#,
+        )
+        .unwrap();
+
+        let store = PreferencesStore::open(&path).unwrap();
+
+        assert_eq!(store.snapshot().codex.model, "old-model");
+        assert_eq!(store.general_snapshot(), GeneralPreferences::default());
+        std::fs::remove_dir_all(path.parent().unwrap()).ok();
+    }
+
+    #[test]
+    fn malformed_general_key_falls_back_to_defaults() {
+        let path = temp_file();
+        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
+        std::fs::write(
+            &path,
+            r#"{"codex": {"model": "gpt-5.5", "reasoning": "low"}, "claude": {"model": "haiku", "reasoning": "low"}, "gemini": {"model": "gemini-3-flash-preview", "reasoning": "none"}, "general": "not-an-object"}"#,
+        )
+        .unwrap();
+
+        let store = PreferencesStore::open(&path).unwrap();
+
+        assert_eq!(store.general_snapshot(), GeneralPreferences::default());
+        std::fs::remove_dir_all(path.parent().unwrap()).ok();
+    }
+
+    #[test]
+    fn update_general_rejects_invalid_language_without_changing_snapshot() {
+        let path = temp_file();
+        let store = PreferencesStore::open(&path).unwrap();
+        let before = store.general_snapshot();
+        let mut general = before.clone();
+        general.language = "fr".to_string();
+
+        assert!(store.update_general(general).is_err());
+        assert_eq!(store.general_snapshot(), before);
+    }
+
+    #[test]
+    fn update_provider_does_not_change_general_snapshot() {
+        let path = temp_file();
+        let store = PreferencesStore::open(&path).unwrap();
+
+        let mut general = GeneralPreferences::default();
+        general.language = "ru".to_string();
+        store.update_general(general.clone()).unwrap();
+
+        let mut provider = store.snapshot();
+        provider.codex.model = "changed".to_string();
+        store.update(provider).unwrap();
+
+        assert_eq!(store.general_snapshot(), general);
+        std::fs::remove_dir_all(path.parent().unwrap()).ok();
+    }
+
+    #[test]
+    fn update_general_does_not_change_provider_snapshot() {
+        let path = temp_file();
+        let store = PreferencesStore::open(&path).unwrap();
+
+        let mut provider = store.snapshot();
+        provider.codex.model = "changed".to_string();
+        store.update(provider.clone()).unwrap();
+
+        let mut general = GeneralPreferences::default();
+        general.language = "ru".to_string();
+        store.update_general(general).unwrap();
+
+        assert_eq!(store.snapshot(), provider);
+        std::fs::remove_dir_all(path.parent().unwrap()).ok();
+    }
+
+    #[test]
+    fn general_snapshot_is_unchanged_after_concurrent_update() {
+        let path = temp_file();
+        let store = PreferencesStore::open(&path).unwrap();
+        let in_flight = store.general_snapshot();
+        let mut next = in_flight.clone();
+        next.language = "ru".to_string();
+
+        store.update_general(next.clone()).unwrap();
+
+        assert_eq!(in_flight.language, "en");
+        assert_eq!(store.general_snapshot().language, "ru");
+        std::fs::remove_dir_all(path.parent().unwrap()).ok();
+    }
+
+    #[test]
+    fn startup_position_returns_pinned_position_in_pin_mode() {
+        let mut general = GeneralPreferences::default();
+        general.position_mode = PositionMode::Pin;
+        general.pinned_position = Some(Position { x: 100, y: 200 });
+        general.last_known_position = Some(Position { x: 300, y: 400 });
+
+        assert_eq!(general.startup_position(), Some(Position { x: 100, y: 200 }));
+    }
+
+    #[test]
+    fn startup_position_returns_last_known_position_in_track_mode() {
+        let mut general = GeneralPreferences::default();
+        general.position_mode = PositionMode::TrackLast;
+        general.pinned_position = Some(Position { x: 100, y: 200 });
+        general.last_known_position = Some(Position { x: 300, y: 400 });
+
+        assert_eq!(general.startup_position(), Some(Position { x: 300, y: 400 }));
+    }
+
+    #[test]
+    fn startup_position_returns_none_when_selected_mode_position_is_missing() {
+        let general = GeneralPreferences::default();
+        assert_eq!(general.startup_position(), None);
+    }
+
+    #[test]
+    fn existing_provider_tests_still_pass_with_new_file_format() {
+        let path = temp_file();
+        let store = PreferencesStore::open(&path).unwrap();
+
+        let mut next = ProviderPreferences::default();
+        next.codex.model = "test-model".to_string();
+
+        let saved = store.update(next).unwrap();
+        assert_eq!(saved.codex.model, "test-model");
+        assert_eq!(store.snapshot(), saved);
+        assert_eq!(PreferencesStore::open(&path).unwrap().snapshot(), saved);
+
+        let reopened = PreferencesStore::open(&path).unwrap();
+        assert_eq!(reopened.general_snapshot(), GeneralPreferences::default());
+        std::fs::remove_dir_all(path.parent().unwrap()).ok();
+    }
 }
diff --git a/src/components/Bubble.tsx b/src/components/Bubble.tsx
index 977b48a..1efb9eb 100644
--- a/src/components/Bubble.tsx
+++ b/src/components/Bubble.tsx
@@ -1,4 +1,5 @@
 import { useEffect, useReducer, useRef, useState } from "react";
+import { getCurrentWindow } from "@tauri-apps/api/window";
 import { bubbleReducer, type BubbleState } from "../state/bubbleState";
 import { applyWindowSize } from "../state/windowResize";
 import { useClickVsDrag } from "../state/drag";
@@ -45,6 +46,8 @@ export function Bubble({
   const [state, dispatch] = useReducer(bubbleReducer, initialState);
   const [routesBySession, setRoutesBySession] = useState<Record<string, ActiveRoute>>({});
   const chat = useChat(chatApi);
+  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
+  const lastSavedPos = useRef<{ x: number; y: number } | null>(null);
 
   // The collapsed dot and the panel mark are both window-drag handles and click
   // targets; this shared hook tells a click apart from a drag so dragging the
@@ -95,6 +98,45 @@ export function Bubble({
     }
   }, [state]);
 
+  useEffect(() => {
+    const api = chatApi;
+    if (api === inertChatApi) return;
+    let cancelled = false;
+
+    const savePosition = async () => {
+      try {
+        const pos = lastSavedPos.current;
+        if (!pos) return;
+        const prefs = await api.getGeneralPreferences();
+        const updated = { ...prefs, lastKnownPosition: pos };
+        await api.updateGeneralPreferences(updated);
+      } catch {
+        // best-effort position tracking
+      }
+    };
+
+    const scheduleSave = (pos: { x: number; y: number }) => {
+      lastSavedPos.current = pos;
+      if (moveTimer.current) clearTimeout(moveTimer.current);
+      moveTimer.current = setTimeout(() => {
+        if (!cancelled) savePosition();
+      }, 1000);
+    };
+
+    getCurrentWindow()
+      .onMoved((event) => {
+        if (!cancelled) scheduleSave({ x: event.payload.x, y: event.payload.y });
+      })
+      .then((unlisten) => {
+        if (cancelled) unlisten();
+      });
+
+    return () => {
+      cancelled = true;
+      if (moveTimer.current) clearTimeout(moveTimer.current);
+    };
+  }, [chatApi]);
+
   if (state === "collapsed") {
     return (
       <div className="bubble bubble--collapsed">
@@ -184,7 +226,7 @@ export function Bubble({
           <div className="panel__body settings">
             {/* Section rail and panes (SP-031). Empty placeholder panes arrive with
                 later tasks filling each section. */}
-            <Settings />
+            <Settings chatApi={chatApi} />
           </div>
         ) : (
           <ChatPanel
diff --git a/src/styles.css b/src/styles.css
index 06c09b3..1eb286e 100644
--- a/src/styles.css
+++ b/src/styles.css
@@ -367,6 +367,121 @@ body {
   line-height: 1.4;
 }
 
+.general-settings {
+  display: flex;
+  flex-direction: column;
+  gap: var(--space-3);
+  margin-top: var(--space-2);
+}
+
+.settings-toggle {
+  display: flex;
+  align-items: center;
+  gap: var(--space-2);
+  cursor: pointer;
+}
+
+.settings-toggle input[type="checkbox"] {
+  width: 16px;
+  height: 16px;
+  cursor: pointer;
+}
+
+.settings-group {
+  display: flex;
+  flex-direction: column;
+  gap: var(--space-1);
+  border: none;
+  padding: 0;
+  margin: 0;
+}
+
+.settings-group legend {
+  padding: 0;
+  font-weight: var(--font-weight-bold);
+  color: var(--color-text);
+  margin-bottom: var(--space-1);
+}
+
+.settings-radio {
+  display: flex;
+  align-items: center;
+  gap: var(--space-2);
+  cursor: pointer;
+  margin-left: var(--space-3);
+}
+
+.settings-radio input[type="radio"] {
+  cursor: pointer;
+}
+
+.settings-btn {
+  margin-left: var(--space-3);
+  padding: var(--space-1) var(--space-3);
+  cursor: pointer;
+  align-self: flex-start;
+}
+
+.settings-field {
+  display: flex;
+  align-items: center;
+  gap: var(--space-2);
+}
+
+.settings-field select {
+  padding: var(--space-1) var(--space-2);
+  cursor: pointer;
+}
+
+.lang-select {
+  position: relative;
+}
+
+.lang-select__current {
+  padding: var(--space-1) var(--space-2);
+  cursor: pointer;
+  border: 1px solid var(--color-border);
+  border-radius: var(--radius-sm);
+  background: var(--surface-raised);
+  min-width: 100px;
+  text-align: left;
+}
+
+.lang-select__menu {
+  position: absolute;
+  top: 100%;
+  left: 0;
+  margin-top: 2px;
+  border: 1px solid var(--color-border);
+  border-radius: var(--radius-sm);
+  background: var(--surface-raised);
+  min-width: 100%;
+  z-index: 10;
+  overflow: hidden;
+}
+
+.lang-select__option {
+  display: block;
+  width: 100%;
+  padding: var(--space-1) var(--space-2);
+  text-align: left;
+  border: none;
+  background: none;
+  cursor: pointer;
+}
+
+.lang-select__option:hover {
+  background: var(--tint-honey);
+}
+
+.lang-select__option--active {
+  font-weight: var(--font-weight-bold);
+}
+
+.lang-select__option + .lang-select__option {
+  border-top: 1px solid var(--color-border);
+}
+
 .panel__body {
   flex: 1;
   display: flex;
diff --git a/vitest.setup.ts b/vitest.setup.ts
index e262193..c14804d 100644
--- a/vitest.setup.ts
+++ b/vitest.setup.ts
@@ -1,6 +1,16 @@
 import "@testing-library/jest-dom/vitest";
 import { cleanup } from "@testing-library/react";
-import { afterEach } from "vitest";
+import { afterEach, vi } from "vitest";
+
+vi.mock("@tauri-apps/api/window", () => ({
+  getCurrentWindow: () => ({
+    setSize: vi.fn(),
+    setAlwaysOnTop: vi.fn(),
+    outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
+    onMoved: vi.fn().mockResolvedValue(() => {}),
+  }),
+  LogicalSize: vi.fn(),
+}));
 
 afterEach(() => {
   cleanup();
```

## Validation Evidence
Agent: test-runner - output below
Status: Pass. 234 Rust + 216 frontend tests, build + tsc clean
