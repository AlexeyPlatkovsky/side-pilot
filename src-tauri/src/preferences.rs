//! File-backed, non-secret application preferences.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::adapters::{AdapterRequest, AssistantId};

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
    pub fn for_provider(&self, provider: AssistantId) -> &ProviderPreference {
        match provider {
            AssistantId::Codex => &self.codex,
            AssistantId::Claude => &self.claude,
            AssistantId::Gemini => &self.gemini,
        }
    }

    pub fn apply_to_request(&self, request: &mut AdapterRequest) {
        let preference = self.for_provider(request.assistant);
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

pub struct PreferencesStore {
    path: PathBuf,
    snapshot: Mutex<ProviderPreferences>,
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
        let snapshot = match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str::<Value>(&contents)
                .map(ProviderPreferences::from_partial_json)
                .unwrap_or_default(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                ProviderPreferences::default()
            }
            Err(error) => {
                return Err(PreferencesError::Persistence {
                    detail: format!("failed to read preferences: {error}"),
                })
            }
        };
        Ok(Self {
            path,
            snapshot: Mutex::new(snapshot),
            replace_file,
        })
    }

    pub fn snapshot(&self) -> ProviderPreferences {
        self.snapshot
            .lock()
            .expect("preferences snapshot lock poisoned")
            .clone()
    }

    pub fn update(
        &self,
        preferences: ProviderPreferences,
    ) -> Result<ProviderPreferences, PreferencesError> {
        let preferences = preferences.normalized()?;
        let mut snapshot = self
            .snapshot
            .lock()
            .expect("preferences snapshot lock poisoned");
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
        let bytes = serde_json::to_vec_pretty(&preferences).map_err(|error| {
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
        *snapshot = preferences.clone();
        Ok(preferences)
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
        }
    }
}
