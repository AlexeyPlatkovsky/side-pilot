# Code Review Context — SP-037 General Section UI

## Task
SP-037: General section UI for launch, always-on-top, position, language. Build settings controls for always-on-top toggle, window position mode (pin/track), and language selector. Wire each control to the preferences store.

## Implementation Summary

**Rust core (non-trivial):**
- preferences.rs: Added Position struct, PositionMode enum, GeneralPreferences struct with normalized() validation (en/ru only). Extended PreferencesStore with dual snapshots (provider + general), new general_snapshot() and update_general() with atomic file persistence. PersistedPreferences wrapper for serializing both provider and general preferences together.
- commands.rs: Added get_general_preferences and update_general_preferences commands (thin wrappers).
- lib.rs: Registered new commands.

**Frontend (non-trivial):**
- GeneralSettings.tsx (NEW): React component with always-on-top checkbox (calls Tauri window API), position mode radio group (pin/track), Pin button (captures current window position), language dropdown (en/ru). Loads prefs on mount via ChatApi, persists on change.
- GeneralSettings.test.tsx (NEW): 9 tests covering mount/load, toggle on/off, language change, position mode switch, pin button, loading state, error state.
- Settings.tsx: Added ChatApi prop, wired GeneralSettings into general pane.
- Settings.test.tsx: All 13 tests updated with mockChatApi.
- Bubble.tsx: Passes chatApi to Settings.
- api.ts: Added getGeneralPreferences/updateGeneralPreferences to ChatApi interface + implementations.

**Permissions:**
- capabilities/default.json: Added allow-get-general-preferences, allow-update-general-preferences.
- build.rs: Added get_general_preferences, update_general_preferences.

## Validation Evidence
Agent: test-runner - output below
Status: Pass
npm run test: 212 passed, cargo nextest: 231 passed, npm run build: pass, cargo build: pass, tsc --noEmit: pass

## Git Diff Summary
 .gitignore                          |   2 +-
 src-tauri/build.rs                  |   2 +
 src-tauri/capabilities/default.json |   2 +
 src-tauri/src/commands.rs           |  17 +-
 src-tauri/src/lib.rs                |   2 +
 src-tauri/src/preferences.rs        | 364 ++++++++++++++++++++++++++++++++++--
 src/chat/api.ts                     |   7 +
 src/components/Bubble.tsx           |   2 +-
 src/components/ChatPanel.test.tsx   |   2 +
 src/components/Settings.test.tsx    |  74 +++++---
 src/components/Settings.tsx         |  18 +-
 src/e2e-seeded-fixture.tsx          |   9 +
 src/styles.css                      |  66 +++++++
 13 files changed, 524 insertions(+), 43 deletions(-)

## Full Diff (key files)

```diff
diff --git a/src-tauri/src/commands.rs b/src-tauri/src/commands.rs
index cca1e1c..4a9fc79 100644
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -13,7 +13,7 @@ use tauri::State;
 use tokio_util::sync::CancellationToken;
 
 use crate::adapters::{AdapterError, AdapterRegistry, AdapterRequest, AdapterResult, AssistantId};
-use crate::preferences::{PreferencesError, PreferencesStore, ProviderPreferences};
+use crate::preferences::{GeneralPreferences, PreferencesError, PreferencesStore, ProviderPreferences};
 use crate::routing::{
     execute_route_with_preferences, retry_result, ProviderRunOutcome, RetryRequest, RouteRequest,
     RouteRunResult,
@@ -222,6 +222,21 @@ pub fn update_provider_preferences(
     preferences.update(value)
 }
 
+/// Return the in-memory general preference snapshot.
+#[tauri::command]
+pub fn get_general_preferences(preferences: State<'_, PreferencesStore>) -> GeneralPreferences {
+    preferences.general_snapshot()
+}
+
+/// Validate, atomically persist, and immediately activate general preferences.
+#[tauri::command]
+pub fn update_general_preferences(
+    preferences: State<'_, PreferencesStore>,
+    value: GeneralPreferences,
+) -> Result<GeneralPreferences, PreferencesError> {
+    preferences.update_general(value)
+}
+
 /// Cancel an in-flight adapter run. Returns whether an active run was found.
 #[tauri::command]
 pub async fn cancel_adapter_run(
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 6cabcc5..49c3df7 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -41,6 +41,8 @@ pub fn run() {
             commands::retry_route,
             commands::get_provider_preferences,
             commands::update_provider_preferences,
+            commands::get_general_preferences,
+            commands::update_general_preferences,
             commands::cancel_adapter_run,
             commands::create_session,
             commands::append_message,
diff --git a/src-tauri/src/preferences.rs b/src-tauri/src/preferences.rs
index 6f9cea3..b921658 100644
--- a/src-tauri/src/preferences.rs
+++ b/src-tauri/src/preferences.rs
@@ -145,9 +145,78 @@ fn parse_provider(value: Option<&Value>) -> Option<ProviderPreference> {
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
 
@@ -161,12 +230,25 @@ impl PreferencesStore {
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
@@ -176,27 +258,40 @@ impl PreferencesStore {
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
@@ -207,7 +302,13 @@ impl PreferencesStore {
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
@@ -228,9 +329,64 @@ impl PreferencesStore {
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
@@ -542,4 +698,188 @@ mod tests {
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
diff --git a/src/chat/api.ts b/src/chat/api.ts
index 6ae8382..1a53b4f 100644
--- a/src/chat/api.ts
+++ b/src/chat/api.ts
@@ -28,6 +28,7 @@ import type { RouteRequest as RustRouteRequest } from "./generated/RouteRequest"
 import type { RouteRunResult as RustRouteRunResult } from "./generated/RouteRunResult";
 import type { ProviderRunOutcome as RustProviderRunOutcome } from "./generated/ProviderRunOutcome";
 import type { ProviderPreferences } from "./generated/ProviderPreferences";
+import type { GeneralPreferences } from "./generated/GeneralPreferences";
 import type { AssistantId } from "./generated/AssistantId";
 
 /**
@@ -94,6 +95,8 @@ export interface ChatApi {
   retryRoute(request: RetryRouteRequest): Promise<ProviderRunOutcome>;
   getProviderPreferences(): Promise<ProviderPreferences>;
   updateProviderPreferences(value: ProviderPreferences): Promise<ProviderPreferences>;
+  getGeneralPreferences(): Promise<GeneralPreferences>;
+  updateGeneralPreferences(value: GeneralPreferences): Promise<GeneralPreferences>;
   createSession(title?: string | null): Promise<PersistedSession>;
   appendMessage(message: NewMessage): Promise<PersistedMessage>;
   readHistory(sessionId: string): Promise<PersistedMessage[]>;
@@ -120,6 +123,8 @@ export const tauriChatApi: ChatApi = {
   retryRoute: (request) => invoke("retry_route", { ...request }),
   getProviderPreferences: () => invoke("get_provider_preferences"),
   updateProviderPreferences: (value) => invoke("update_provider_preferences", { value }),
+  getGeneralPreferences: () => invoke("get_general_preferences"),
+  updateGeneralPreferences: (value) => invoke("update_general_preferences", { value }),
   createSession: (title = null) => invoke("create_session", { title }),
   appendMessage: (message) => invoke("append_message", { message }),
   readHistory: (sessionId) => invoke("read_history", { sessionId }),
@@ -143,6 +148,8 @@ export const inertChatApi: ChatApi = {
   retryRoute: () => Promise.reject(new Error("chat backend unavailable")),
   getProviderPreferences: () => Promise.reject(new Error("chat backend unavailable")),
   updateProviderPreferences: () => Promise.reject(new Error("chat backend unavailable")),
+  getGeneralPreferences: () => Promise.reject(new Error("chat backend unavailable")),
+  updateGeneralPreferences: () => Promise.reject(new Error("chat backend unavailable")),
   createSession: () =>
     Promise.resolve({
       id: "inert-session",
diff --git a/src/components/Bubble.tsx b/src/components/Bubble.tsx
index 977b48a..951d78f 100644
--- a/src/components/Bubble.tsx
+++ b/src/components/Bubble.tsx
@@ -184,7 +184,7 @@ export function Bubble({
           <div className="panel__body settings">
             {/* Section rail and panes (SP-031). Empty placeholder panes arrive with
                 later tasks filling each section. */}
-            <Settings />
+            <Settings chatApi={chatApi} />
           </div>
         ) : (
           <ChatPanel
diff --git a/src/components/Settings.tsx b/src/components/Settings.tsx
index 3f30417..a353f5a 100644
--- a/src/components/Settings.tsx
+++ b/src/components/Settings.tsx
@@ -1,4 +1,6 @@
 import { useState, useCallback, type KeyboardEvent } from "react";
+import type { ChatApi } from "../chat/api";
+import { GeneralSettings } from "./GeneralSettings";
 
 export type SettingsSection =
   | "api-keys"
@@ -24,6 +26,10 @@ const SECTIONS: SectionDef[] = [
   { id: "about", label: "About" },
 ];
 
+export interface SettingsProps {
+  chatApi: ChatApi;
+}
+
 /**
  * Settings view shell with a left section rail and an active-content pane
  * (SP-029, SP-031). Each pane is an empty placeholder for this task; later
@@ -31,7 +37,7 @@ const SECTIONS: SectionDef[] = [
  * the ARIA Tabs pattern: Arrow Up / Down move between tabs with wrapping,
  * Home / End jump to first / last.
  */
-export function Settings() {
+export function Settings({ chatApi }: SettingsProps) {
   const [active, setActive] = useState<SettingsSection>("api-keys");
 
   const select = useCallback((section: SettingsSection) => {
@@ -111,9 +117,13 @@ export function Settings() {
               className="settings-pane__content"
             >
               <h2 className="settings-pane__title">{section.label}</h2>
-              <p className="settings-pane__placeholder">
-                {section.label} settings arrive in a future update.
-              </p>
+              {section.id === "general" ? (
+                <GeneralSettings api={chatApi} />
+              ) : (
+                <p className="settings-pane__placeholder">
+                  {section.label} settings arrive in a future update.
+                </p>
+              )}
             </div>
           );
         })}
```
