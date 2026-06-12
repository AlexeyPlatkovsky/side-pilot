//! File-backed, non-secret application preferences.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::adapters::{AdapterRequest, AssistantId};
use crate::cli_integrations::CliIntegrations;

type ReplaceFile = fn(&Path, &Path) -> std::io::Result<()>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub enum PreferencesError {
    Validation { detail: String },
    Persistence { detail: String },
}

impl std::fmt::Display for PreferencesError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation { detail } => write!(formatter, "invalid preferences: {detail}"),
            Self::Persistence { detail } => {
                write!(formatter, "preferences persistence failed: {detail}")
            }
        }
    }
}

impl std::error::Error for PreferencesError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct ProviderPreference {
    pub model: String,
    pub reasoning: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct ProviderPreferences {
    pub codex: ProviderPreference,
    pub claude: ProviderPreference,
    pub gemini: ProviderPreference,
}

impl Default for ProviderPreferences {
    fn default() -> Self {
        Self {
            codex: ProviderPreference::new("gpt-5.5", "low"),
            claude: ProviderPreference::new("haiku", "low"),
            gemini: ProviderPreference::new("gemini-3-flash-preview", "none"),
        }
    }
}

impl ProviderPreferences {
    /// The model/effort preference for a built-in provider. Custom providers
    /// carry no model/effort preference (SP-072); callers special-case them and
    /// never reach the `Custom` fallback, which returns codex's slot so the
    /// accessor stays total without panicking.
    pub fn for_provider(&self, provider: &AssistantId) -> &ProviderPreference {
        match provider {
            AssistantId::Codex => &self.codex,
            AssistantId::Claude => &self.claude,
            AssistantId::Gemini => &self.gemini,
            AssistantId::Custom(_) => &self.codex,
        }
    }

    pub fn apply_to_request(&self, request: &mut AdapterRequest) {
        // A custom CLI takes no model/effort flag — it is driven purely by its
        // resolved command and stdin prompt (SP-072).
        if request.assistant.is_custom() {
            request.model = None;
            request.reasoning_effort = None;
            return;
        }
        let preference = self.for_provider(&request.assistant);
        request.model = Some(preference.model.clone());
        request.reasoning_effort = if request.assistant == AssistantId::Gemini {
            None
        } else {
            preference.reasoning_argument()
        };
    }

    fn normalized(self) -> Result<Self, PreferencesError> {
        Ok(Self {
            codex: self.codex.normalized("codex")?,
            claude: self.claude.normalized("claude")?,
            gemini: self.gemini.normalized("gemini")?,
        })
    }

    fn from_partial_json(value: Value) -> Self {
        let defaults = Self::default();
        let Some(object) = value.as_object() else {
            return defaults;
        };
        Self {
            codex: parse_provider(object.get("codex")).unwrap_or(defaults.codex),
            claude: parse_provider(object.get("claude")).unwrap_or(defaults.claude),
            gemini: parse_provider(object.get("gemini")).unwrap_or(defaults.gemini),
        }
    }
}

impl ProviderPreference {
    fn new(model: &str, reasoning: &str) -> Self {
        Self {
            model: model.to_string(),
            reasoning: reasoning.to_string(),
        }
    }

    fn normalized(self, provider: &str) -> Result<Self, PreferencesError> {
        let model = self.model.trim().to_string();
        if model.is_empty() || model.chars().count() > 100 {
            return Err(PreferencesError::Validation {
                detail: format!(
                    "{provider} model must be a non-empty value of at most 100 characters"
                ),
            });
        }
        let reasoning = normalize_reasoning(&self.reasoning);
        Ok(Self { model, reasoning })
    }

    pub fn reasoning_argument(&self) -> Option<String> {
        (self.reasoning != "none" && !self.reasoning.is_empty()).then(|| self.reasoning.clone())
    }
}

fn normalize_reasoning(reasoning: &str) -> String {
    let trimmed = reasoning.trim();
    if trimmed.is_empty() || trimmed == "none" {
        "none".to_string()
    } else {
        trimmed.to_string()
    }
}

fn parse_provider(value: Option<&Value>) -> Option<ProviderPreference> {
    let object = value?.as_object()?;
    let preference = ProviderPreference {
        model: object.get("model")?.as_str()?.to_string(),
        reasoning: object.get("reasoning")?.as_str()?.to_string(),
    };
    preference.normalized("provider").ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub enum PositionMode {
    Pin,
    #[default]
    TrackLast,
}

fn default_theme() -> String {
    "default".to_string()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct GeneralPreferences {
    pub always_on_top: bool,
    pub position_mode: PositionMode,
    pub pinned_position: Option<Position>,
    pub last_known_position: Option<Position>,
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
}

impl Default for GeneralPreferences {
    fn default() -> Self {
        Self {
            always_on_top: true,
            position_mode: PositionMode::default(),
            pinned_position: None,
            last_known_position: None,
            language: "en".to_string(),
            theme: default_theme(),
        }
    }
}

impl GeneralPreferences {
    fn normalized(self) -> Result<Self, PreferencesError> {
        match self.language.as_str() {
            "en" | "ru" => {}
            other => {
                return Err(PreferencesError::Validation {
                    detail: format!("unsupported language: {other}"),
                });
            }
        }
        match self.theme.as_str() {
            "default" | "cyberpunk" | "minimalist" => {}
            other => {
                return Err(PreferencesError::Validation {
                    detail: format!("unsupported theme: {other}"),
                });
            }
        }
        Ok(self)
    }

    pub fn startup_position(&self) -> Option<Position> {
        match self.position_mode {
            PositionMode::Pin => self.pinned_position,
            PositionMode::TrackLast => self.last_known_position,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedPreferences {
    codex: ProviderPreference,
    claude: ProviderPreference,
    gemini: ProviderPreference,
    general: GeneralPreferences,
    cli_integrations: CliIntegrations,
}

pub struct PreferencesStore {
    path: PathBuf,
    provider_snapshot: Mutex<ProviderPreferences>,
    general_snapshot: Mutex<GeneralPreferences>,
    cli_integrations_snapshot: Mutex<CliIntegrations>,
    replace_file: ReplaceFile,
}

impl PreferencesStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, PreferencesError> {
        Self::open_with_replacer(path, replace_file)
    }

    fn open_with_replacer(
        path: impl AsRef<Path>,
        replace_file: ReplaceFile,
    ) -> Result<Self, PreferencesError> {
        let path = path.as_ref().to_path_buf();
        let (provider, general, cli_integrations) = match fs::read_to_string(&path) {
            Ok(contents) => {
                let parsed = serde_json::from_str::<Value>(&contents);
                let provider = parsed
                    .as_ref()
                    .ok()
                    .map(|v| ProviderPreferences::from_partial_json(v.clone()))
                    .unwrap_or_default();
                let general = parsed
                    .as_ref()
                    .ok()
                    .and_then(|v| v.get("general"))
                    .and_then(|g| serde_json::from_value::<GeneralPreferences>(g.clone()).ok())
                    .and_then(|g| g.normalized().ok())
                    .unwrap_or_default();
                let cli_integrations = parsed
                    .as_ref()
                    .ok()
                    .and_then(|v| v.get("cliIntegrations"))
                    .and_then(|ci| serde_json::from_value::<CliIntegrations>(ci.clone()).ok())
                    .unwrap_or_default();
                (provider, general, cli_integrations)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                (
                    ProviderPreferences::default(),
                    GeneralPreferences::default(),
                    CliIntegrations::default(),
                )
            }
            Err(error) => {
                return Err(PreferencesError::Persistence {
                    detail: format!("failed to read preferences: {error}"),
                })
            }
        };
        Ok(Self {
            path,
            provider_snapshot: Mutex::new(provider),
            general_snapshot: Mutex::new(general),
            cli_integrations_snapshot: Mutex::new(cli_integrations),
            replace_file,
        })
    }

    pub fn snapshot(&self) -> ProviderPreferences {
        self.provider_snapshot
            .lock()
            .expect("preferences snapshot lock poisoned")
            .clone()
    }

    pub fn general_snapshot(&self) -> GeneralPreferences {
        self.general_snapshot
            .lock()
            .expect("general preferences snapshot lock poisoned")
            .clone()
    }

    pub fn cli_integrations_snapshot(&self) -> CliIntegrations {
        self.cli_integrations_snapshot
            .lock()
            .expect("cli integrations snapshot lock poisoned")
            .clone()
    }

    /// Atomically write all preference fields to disk.
    /// Acquires no locks — callers must pass already-cloned values.
    fn persist_all(
        &self,
        provider: &ProviderPreferences,
        general: &GeneralPreferences,
        cli_integrations: &CliIntegrations,
    ) -> Result<(), PreferencesError> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| PreferencesError::Persistence {
                detail: "preferences path has no parent directory".to_string(),
            })?;
        fs::create_dir_all(parent).map_err(|error| PreferencesError::Persistence {
            detail: format!("failed to create app data: {error}"),
        })?;
        let temp_path = parent.join(format!(".preferences-{}.tmp", uuid::Uuid::new_v4()));
        let persisted = PersistedPreferences {
            codex: provider.codex.clone(),
            claude: provider.claude.clone(),
            gemini: provider.gemini.clone(),
            general: general.clone(),
            cli_integrations: cli_integrations.clone(),
        };
        let bytes = serde_json::to_vec_pretty(&persisted).map_err(|error| {
            PreferencesError::Persistence {
                detail: format!("failed to serialize preferences: {error}"),
            }
        })?;
        let mut temp =
            fs::File::create(&temp_path).map_err(|error| PreferencesError::Persistence {
                detail: format!("failed to create preferences temp file: {error}"),
            })?;
        if let Err(error) = temp.write_all(&bytes).and_then(|_| temp.sync_all()) {
            fs::remove_file(&temp_path).ok();
            return Err(PreferencesError::Persistence {
                detail: format!("failed to write preferences: {error}"),
            });
        }
        if let Err(error) = (self.replace_file)(&temp_path, &self.path) {
            fs::remove_file(&temp_path).ok();
            return Err(PreferencesError::Persistence {
                detail: format!("failed to replace preferences: {error}"),
            });
        }
        Ok(())
    }

    pub fn update(
        &self,
        preferences: ProviderPreferences,
    ) -> Result<ProviderPreferences, PreferencesError> {
        let preferences = preferences.normalized()?;
        let mut provider_snapshot = self
            .provider_snapshot
            .lock()
            .expect("preferences snapshot lock poisoned");
        let general = self
            .general_snapshot
            .lock()
            .expect("general preferences snapshot lock poisoned")
            .clone();
        let cli_integrations = self
            .cli_integrations_snapshot
            .lock()
            .expect("cli integrations snapshot lock poisoned")
            .clone();
        self.persist_all(&preferences, &general, &cli_integrations)?;
        *provider_snapshot = preferences.clone();
        Ok(preferences)
    }

    pub fn update_general(
        &self,
        general: GeneralPreferences,
    ) -> Result<GeneralPreferences, PreferencesError> {
        let general = general.normalized()?;
        let provider = self
            .provider_snapshot
            .lock()
            .expect("preferences snapshot lock poisoned")
            .clone();
        let mut general_snapshot = self
            .general_snapshot
            .lock()
            .expect("general preferences snapshot lock poisoned");
        let cli_integrations = self
            .cli_integrations_snapshot
            .lock()
            .expect("cli integrations snapshot lock poisoned")
            .clone();
        self.persist_all(&provider, &general, &cli_integrations)?;
        *general_snapshot = general.clone();
        Ok(general)
    }

    pub fn update_cli_integrations(
        &self,
        value: CliIntegrations,
    ) -> Result<CliIntegrations, PreferencesError> {
        value
            .validate_custom()
            .map_err(|detail| PreferencesError::Validation { detail })?;
        let provider = self
            .provider_snapshot
            .lock()
            .expect("preferences snapshot lock poisoned")
            .clone();
        let general = self
            .general_snapshot
            .lock()
            .expect("general preferences snapshot lock poisoned")
            .clone();
        let mut cli_snapshot = self
            .cli_integrations_snapshot
            .lock()
            .expect("cli integrations snapshot lock poisoned");
        self.persist_all(&provider, &general, &value)?;
        *cli_snapshot = value.clone();
        Ok(value)
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::PermissionMode;
    use std::sync::Arc;
    use uuid::Uuid;

    fn temp_file() -> PathBuf {
        std::env::temp_dir()
            .join(format!("side-pilot-preferences-{}", Uuid::new_v4()))
            .join("preferences.json")
    }

    #[test]
    fn defaults_are_fixed_for_every_provider() {
        let preferences = ProviderPreferences::default();

        assert_eq!(
            preferences.codex,
            ProviderPreference {
                model: "gpt-5.5".to_string(),
                reasoning: "low".to_string(),
            }
        );
        assert_eq!(preferences.claude.model, "haiku");
        assert_eq!(preferences.claude.reasoning, "low");
        assert_eq!(preferences.gemini.model, "gemini-3-flash-preview");
        assert_eq!(preferences.gemini.reasoning, "none");
    }

    #[test]
    fn missing_and_malformed_files_use_defaults() {
        let path = temp_file();
        assert_eq!(
            PreferencesStore::open(&path).unwrap().snapshot(),
            ProviderPreferences::default()
        );

        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "{broken").unwrap();
        assert_eq!(
            PreferencesStore::open(&path).unwrap().snapshot(),
            ProviderPreferences::default()
        );
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn valid_partial_file_preserves_valid_entries_and_defaults_invalid_ones() {
        let path = temp_file();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            r#"{
              "codex": {"model": " custom-codex ", "reasoning": " xhigh "},
              "claude": {"model": "", "reasoning": "low"},
              "unknown": {"model": "ignored", "reasoning": "ignored"}
            }"#,
        )
        .unwrap();

        let preferences = PreferencesStore::open(&path).unwrap().snapshot();

        assert_eq!(preferences.codex.model, "custom-codex");
        assert_eq!(preferences.codex.reasoning, "xhigh");
        assert_eq!(preferences.claude, ProviderPreferences::default().claude);
        assert_eq!(preferences.gemini, ProviderPreferences::default().gemini);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn wrong_kind_partial_entries_default_independently() {
        let path = temp_file();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            r#"{"codex": [], "claude": {"model": 42, "reasoning": "low"}}"#,
        )
        .unwrap();

        let preferences = PreferencesStore::open(&path).unwrap().snapshot();

        assert_eq!(preferences.codex, ProviderPreferences::default().codex);
        assert_eq!(preferences.claude, ProviderPreferences::default().claude);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn update_validates_atomically_persists_and_refreshes_snapshot() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let mut next = ProviderPreferences::default();
        next.codex.model = " codex-next ".to_string();
        next.codex.reasoning = " none ".to_string();
        next.claude.reasoning = "arbitrary-value".to_string();

        let saved = store.update(next).unwrap();

        assert_eq!(saved.codex.model, "codex-next");
        assert_eq!(saved.codex.reasoning, "none");
        assert_eq!(saved.claude.reasoning, "arbitrary-value");
        assert_eq!(store.snapshot(), saved);
        assert_eq!(PreferencesStore::open(&path).unwrap().snapshot(), saved);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn update_rejects_empty_and_overlong_models_without_changing_snapshot() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let before = store.snapshot();
        let mut invalid = before.clone();
        invalid.gemini.model = " ".to_string();
        assert!(store.update(invalid).is_err());
        assert_eq!(store.snapshot(), before);

        let mut invalid = before.clone();
        invalid.codex.model = "x".repeat(101);
        assert!(store.update(invalid).is_err());
        assert_eq!(store.snapshot(), before);
    }

    #[test]
    fn update_accepts_exactly_one_hundred_model_characters() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let mut next = store.snapshot();
        next.codex.model = "x".repeat(100);

        let saved = store.update(next).unwrap();

        assert_eq!(saved.codex.model.chars().count(), 100);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn whitespace_reasoning_normalizes_to_none() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let mut next = store.snapshot();
        next.codex.reasoning = "   ".to_string();

        let saved = store.update(next).unwrap();

        assert_eq!(saved.codex.reasoning, "none");
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn replacement_failure_keeps_file_and_snapshot_unchanged() {
        fn fail_replace(_: &Path, _: &Path) -> std::io::Result<()> {
            Err(std::io::Error::other("replace denied"))
        }

        let path = temp_file();
        let original_store = PreferencesStore::open(&path).unwrap();
        original_store
            .update(ProviderPreferences::default())
            .unwrap();
        let before_file = std::fs::read_to_string(&path).unwrap();
        let store = PreferencesStore::open_with_replacer(&path, fail_replace).unwrap();
        let before_snapshot = store.snapshot();
        let mut next = before_snapshot.clone();
        next.codex.model = "next-model".to_string();

        let error = store.update(next).unwrap_err();

        assert!(matches!(error, PreferencesError::Persistence { .. }));
        assert_eq!(store.snapshot(), before_snapshot);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before_file);
        assert_eq!(
            std::fs::read_dir(path.parent().unwrap())
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
                .count(),
            0
        );
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn concurrent_stores_never_share_or_corrupt_temporary_files() {
        let path = temp_file();
        let first = Arc::new(PreferencesStore::open(&path).unwrap());
        let second = Arc::new(PreferencesStore::open(&path).unwrap());

        let handles = [first, second].map(|store| {
            std::thread::spawn(move || {
                for index in 0..20 {
                    let mut next = ProviderPreferences::default();
                    next.codex.model = format!("model-{index}");
                    store.update(next).unwrap();
                }
            })
        });
        for handle in handles {
            handle.join().unwrap();
        }

        let persisted = PreferencesStore::open(&path).unwrap().snapshot();
        assert!(persisted.codex.model.starts_with("model-"));
        assert_eq!(
            std::fs::read_dir(path.parent().unwrap())
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
                .count(),
            0
        );
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn snapshot_overrides_adapter_request_and_never_sends_gemini_reasoning() {
        let preferences = ProviderPreferences::default();
        let mut request = AdapterRequest {
            assistant: AssistantId::Gemini,
            prompt: "hi".to_string(),
            working_directory: None,
            model: Some("client-override".to_string()),
            reasoning_effort: Some("client-override".to_string()),
            permission_mode: PermissionMode::ReadOnly,
            timeout_ms: 1000,
            resume_session_id: None,
            run_id: None,
            custom_command: None,
        };

        preferences.apply_to_request(&mut request);

        assert_eq!(request.model.as_deref(), Some("gemini-3-flash-preview"));
        assert_eq!(request.reasoning_effort, None);
    }

    #[test]
    fn exact_none_omits_reasoning_but_other_values_pass_through() {
        let mut preferences = ProviderPreferences::default();
        preferences.codex.reasoning = "none".to_string();
        preferences.claude.reasoning = "custom-effort".to_string();
        let mut codex = request_for(AssistantId::Codex);
        let mut claude = request_for(AssistantId::Claude);

        preferences.apply_to_request(&mut codex);
        preferences.apply_to_request(&mut claude);

        assert_eq!(codex.reasoning_effort, None);
        assert_eq!(claude.reasoning_effort.as_deref(), Some("custom-effort"));
    }

    #[test]
    fn an_existing_snapshot_is_unchanged_after_store_update() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let in_flight = store.snapshot();
        let mut next = in_flight.clone();
        next.codex.model = "next-model".to_string();

        store.update(next.clone()).unwrap();

        assert_eq!(in_flight.codex.model, "gpt-5.5");
        assert_eq!(store.snapshot().codex.model, "next-model");
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    fn request_for(assistant: AssistantId) -> AdapterRequest {
        AdapterRequest {
            assistant,
            prompt: "hi".to_string(),
            working_directory: None,
            model: None,
            reasoning_effort: None,
            permission_mode: PermissionMode::ReadOnly,
            timeout_ms: 1000,
            resume_session_id: None,
            run_id: None,
            custom_command: None,
        }
    }

    // --- GeneralPreferences tests ---

    #[test]
    fn general_preferences_defaults_are_fixed() {
        let general = GeneralPreferences::default();

        assert!(general.always_on_top);
        assert_eq!(general.position_mode, PositionMode::TrackLast);
        assert_eq!(general.pinned_position, None);
        assert_eq!(general.last_known_position, None);
        assert_eq!(general.language, "en");
    }

    #[test]
    fn general_preferences_rejects_invalid_language() {
        let general = GeneralPreferences { language: "de".to_string(), ..Default::default() };

        let err = general.normalized().unwrap_err();
        assert!(matches!(err, PreferencesError::Validation { .. }));
    }

    #[test]
    fn accepts_en_and_ru_languages() {
        for lang in ["en", "ru"] {
            let general = GeneralPreferences { language: lang.to_string(), ..Default::default() };
            assert!(general.normalized().is_ok());
        }
    }

    #[test]
    fn general_preferences_persists_and_reads_back() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let general = GeneralPreferences {
            always_on_top: false,
            language: "ru".to_string(),
            pinned_position: Some(Position { x: 100, y: 200 }),
            ..Default::default()
        };

        let saved = store.update_general(general).unwrap();

        assert!(!saved.always_on_top);
        assert_eq!(saved.language, "ru");
        assert_eq!(saved.pinned_position, Some(Position { x: 100, y: 200 }));
        assert_eq!(store.general_snapshot(), saved);

        let reopened = PreferencesStore::open(&path).unwrap();
        assert_eq!(reopened.general_snapshot(), saved);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn general_persists_alongside_provider_without_corruption() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let mut provider = store.snapshot();
        provider.codex.model = "custom-model".to_string();
        store.update(provider).unwrap();

        let general = GeneralPreferences { language: "ru".to_string(), ..Default::default() };
        store.update_general(general).unwrap();

        let reopened = PreferencesStore::open(&path).unwrap();
        assert_eq!(reopened.snapshot().codex.model, "custom-model");
        assert_eq!(reopened.general_snapshot().language, "ru");
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn old_preferences_file_without_general_key_uses_default_general() {
        let path = temp_file();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            r#"{"codex": {"model": "old-model", "reasoning": "low"}, "claude": {"model": "haiku", "reasoning": "low"}, "gemini": {"model": "gemini-3-flash-preview", "reasoning": "none"}}"#,
        )
        .unwrap();

        let store = PreferencesStore::open(&path).unwrap();

        assert_eq!(store.snapshot().codex.model, "old-model");
        assert_eq!(store.general_snapshot(), GeneralPreferences::default());
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn malformed_general_key_falls_back_to_defaults() {
        let path = temp_file();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            r#"{"codex": {"model": "gpt-5.5", "reasoning": "low"}, "claude": {"model": "haiku", "reasoning": "low"}, "gemini": {"model": "gemini-3-flash-preview", "reasoning": "none"}, "general": "not-an-object"}"#,
        )
        .unwrap();

        let store = PreferencesStore::open(&path).unwrap();

        assert_eq!(store.general_snapshot(), GeneralPreferences::default());
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn update_general_rejects_invalid_language_without_changing_snapshot() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let before = store.general_snapshot();
        let mut general = before.clone();
        general.language = "fr".to_string();

        assert!(store.update_general(general).is_err());
        assert_eq!(store.general_snapshot(), before);
    }

    #[test]
    fn update_provider_does_not_change_general_snapshot() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let general = GeneralPreferences { language: "ru".to_string(), ..Default::default() };
        store.update_general(general.clone()).unwrap();

        let mut provider = store.snapshot();
        provider.codex.model = "changed".to_string();
        store.update(provider).unwrap();

        assert_eq!(store.general_snapshot(), general);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn update_general_does_not_change_provider_snapshot() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let mut provider = store.snapshot();
        provider.codex.model = "changed".to_string();
        store.update(provider.clone()).unwrap();

        let general = GeneralPreferences { language: "ru".to_string(), ..Default::default() };
        store.update_general(general).unwrap();

        assert_eq!(store.snapshot(), provider);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn general_snapshot_is_unchanged_after_concurrent_update() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let in_flight = store.general_snapshot();
        let mut next = in_flight.clone();
        next.language = "ru".to_string();

        store.update_general(next.clone()).unwrap();

        assert_eq!(in_flight.language, "en");
        assert_eq!(store.general_snapshot().language, "ru");
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    // --- Theme field tests ---

    #[test]
    fn general_preferences_default_theme_is_default() {
        let general = GeneralPreferences::default();
        assert_eq!(general.theme, "default");
    }

    #[test]
    fn general_preferences_accepts_valid_themes() {
        for theme in ["default", "cyberpunk", "minimalist"] {
            let general = GeneralPreferences { theme: theme.to_string(), ..Default::default() };
            assert!(general.normalized().is_ok(), "theme '{theme}' should be valid");
        }
    }

    #[test]
    fn general_preferences_rejects_invalid_theme() {
        let general = GeneralPreferences { theme: "ocean".to_string(), ..Default::default() };
        let err = general.normalized().unwrap_err();
        assert!(matches!(err, PreferencesError::Validation { .. }));
    }

    #[test]
    fn theme_persists_and_reads_back() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let general = GeneralPreferences { theme: "cyberpunk".to_string(), ..Default::default() };
        let saved = store.update_general(general).unwrap();

        assert_eq!(saved.theme, "cyberpunk");
        assert_eq!(store.general_snapshot().theme, "cyberpunk");

        let reopened = PreferencesStore::open(&path).unwrap();
        assert_eq!(reopened.general_snapshot().theme, "cyberpunk");
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn old_preferences_without_theme_key_uses_default_theme() {
        let path = temp_file();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            r#"{"codex": {"model": "gpt-5.5", "reasoning": "low"}, "claude": {"model": "haiku", "reasoning": "low"}, "gemini": {"model": "gemini-3-flash-preview", "reasoning": "none"}, "general": {"alwaysOnTop": true, "positionMode": "trackLast", "pinnedPosition": null, "lastKnownPosition": null, "language": "en"}}"#,
        )
        .unwrap();

        let store = PreferencesStore::open(&path).unwrap();
        assert_eq!(store.general_snapshot().theme, "default");
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn update_general_rejects_invalid_theme_without_changing_snapshot() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let before = store.general_snapshot();
        let general = GeneralPreferences { theme: "ocean".to_string(), ..before.clone() };

        assert!(store.update_general(general).is_err());
        assert_eq!(store.general_snapshot(), before);
    }

    #[test]
    fn startup_position_returns_pinned_position_in_pin_mode() {
        let general = GeneralPreferences {
            position_mode: PositionMode::Pin,
            pinned_position: Some(Position { x: 100, y: 200 }),
            last_known_position: Some(Position { x: 300, y: 400 }),
            ..Default::default()
        };

        assert_eq!(general.startup_position(), Some(Position { x: 100, y: 200 }));
    }

    #[test]
    fn startup_position_returns_last_known_position_in_track_mode() {
        let general = GeneralPreferences {
            position_mode: PositionMode::TrackLast,
            pinned_position: Some(Position { x: 100, y: 200 }),
            last_known_position: Some(Position { x: 300, y: 400 }),
            ..Default::default()
        };

        assert_eq!(general.startup_position(), Some(Position { x: 300, y: 400 }));
    }

    #[test]
    fn startup_position_returns_none_when_selected_mode_position_is_missing() {
        let general = GeneralPreferences::default();
        assert_eq!(general.startup_position(), None);
    }

    #[test]
    fn existing_provider_tests_still_pass_with_new_file_format() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let mut next = ProviderPreferences::default();
        next.codex.model = "test-model".to_string();

        let saved = store.update(next).unwrap();
        assert_eq!(saved.codex.model, "test-model");
        assert_eq!(store.snapshot(), saved);
        assert_eq!(PreferencesStore::open(&path).unwrap().snapshot(), saved);

        let reopened = PreferencesStore::open(&path).unwrap();
        assert_eq!(reopened.general_snapshot(), GeneralPreferences::default());
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    // --- CliIntegrations tests ---

    #[test]
    fn cli_integrations_defaults_are_fixed() {
        let integrations = CliIntegrations::default();

        assert!(integrations.codex.enabled);
        assert!(integrations.claude.enabled);
        assert!(integrations.gemini.enabled);
    }

    #[test]
    fn cli_integrations_persists_and_reads_back() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let mut integrations = store.cli_integrations_snapshot();
        assert!(integrations.codex.enabled);
        integrations.codex.enabled = false;
        integrations.claude.enabled = false;

        let saved = store.update_cli_integrations(integrations.clone()).unwrap();

        assert!(!saved.codex.enabled);
        assert!(!saved.claude.enabled);
        assert_eq!(store.cli_integrations_snapshot(), saved);

        let reopened = PreferencesStore::open(&path).unwrap();
        let reloaded = reopened.cli_integrations_snapshot();
        assert!(!reloaded.codex.enabled);
        assert!(!reloaded.claude.enabled);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn cli_integrations_survives_provider_and_general_updates() {
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let mut integrations = store.cli_integrations_snapshot();
        integrations.gemini.enabled = false;
        store.update_cli_integrations(integrations).unwrap();

        let mut provider = store.snapshot();
        provider.codex.model = "changed".to_string();
        store.update(provider).unwrap();

        let general = GeneralPreferences { language: "ru".to_string(), ..Default::default() };
        store.update_general(general).unwrap();

        let integrations = store.cli_integrations_snapshot();
        assert!(!integrations.gemini.enabled);

        let reopened = PreferencesStore::open(&path).unwrap();
        assert!(!reopened.cli_integrations_snapshot().gemini.enabled);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn custom_cli_entries_persist_and_read_back() {
        use crate::cli_integrations::CustomCliEntry;
        use crate::cli_integrations::CliDetectionStatus;

        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();

        let mut integrations = store.cli_integrations_snapshot();
        assert!(integrations.custom.is_empty(), "defaults to empty custom vec");
        integrations.custom.push(CustomCliEntry {
            name: "OpenCode".to_string(),
            command: "opencode --prompt".to_string(),
            enabled: true,
            detected_status: CliDetectionStatus::Available,
        });

        store.update_cli_integrations(integrations).unwrap();

        let reopened = PreferencesStore::open(&path).unwrap();
        let reloaded = reopened.cli_integrations_snapshot();
        assert_eq!(reloaded.custom.len(), 1);
        assert_eq!(reloaded.custom[0].name, "OpenCode");
        assert_eq!(reloaded.custom[0].command, "opencode --prompt");
        assert!(reloaded.custom[0].enabled);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn cli_integrations_without_custom_key_defaults_to_empty_vec() {
        let path = temp_file();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        // A pre-SP-072 cliIntegrations block has codex/claude/gemini but no `custom`.
        std::fs::write(
            &path,
            r#"{"cliIntegrations": {"codex": {"assistant": "codex", "enabled": true, "detectedStatus": "available"}, "claude": {"assistant": "claude", "enabled": false, "detectedStatus": "notInstalled"}, "gemini": {"assistant": "gemini", "enabled": true, "detectedStatus": "available"}}}"#,
        )
        .unwrap();

        let store = PreferencesStore::open(&path).unwrap();
        let integrations = store.cli_integrations_snapshot();
        assert!(integrations.custom.is_empty());
        assert!(!integrations.claude.enabled);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn update_cli_integrations_rejects_duplicate_custom_names() {
        use crate::cli_integrations::{CliDetectionStatus, CustomCliEntry};
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let before = store.cli_integrations_snapshot();

        let mut invalid = before.clone();
        let dup = |command: &str| CustomCliEntry {
            name: "OpenCode".to_string(),
            command: command.to_string(),
            enabled: false,
            detected_status: CliDetectionStatus::NotDetected,
        };
        invalid.custom = vec![dup("opencode --prompt"), dup("opencode --stream")];

        let err = store.update_cli_integrations(invalid).unwrap_err();
        assert!(matches!(err, PreferencesError::Validation { .. }));
        // The snapshot is unchanged after a rejected update.
        assert_eq!(store.cli_integrations_snapshot(), before);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn update_cli_integrations_rejects_reserved_base_command() {
        use crate::cli_integrations::{CliDetectionStatus, CustomCliEntry};
        let path = temp_file();
        let store = PreferencesStore::open(&path).unwrap();
        let mut invalid = store.cli_integrations_snapshot();
        invalid.custom = vec![CustomCliEntry {
            name: "Mine".to_string(),
            command: "codex --foo".to_string(),
            enabled: false,
            detected_status: CliDetectionStatus::NotDetected,
        }];
        assert!(matches!(
            store.update_cli_integrations(invalid).unwrap_err(),
            PreferencesError::Validation { .. }
        ));
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn old_preferences_file_without_cli_integrations_uses_defaults() {
        let path = temp_file();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            r#"{"codex": {"model": "old-model", "reasoning": "low"}, "claude": {"model": "haiku", "reasoning": "low"}, "gemini": {"model": "gemini-3-flash-preview", "reasoning": "none"}}"#,
        )
        .unwrap();

        let store = PreferencesStore::open(&path).unwrap();

        assert_eq!(store.snapshot().codex.model, "old-model");
        assert_eq!(store.cli_integrations_snapshot(), CliIntegrations::default());
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }
}
