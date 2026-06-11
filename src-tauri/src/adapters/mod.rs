//! CLI adapter seam.
//!
//! Each assistant (OpenAI Codex, Claude Code, Gemini) is driven through its
//! non-interactive structured-output mode per `docs/idea.md` §"CLI Invocation
//! Contract". The MVP (SP-008) delivers the [`CliAdapter`] trait, the typed
//! request/result/error contract, binary resolution, the subprocess seam, the
//! routing [`AdapterRegistry`], and one registered [`CodexAdapter`].

use std::borrow::Cow;
use std::str::FromStr;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

pub mod ansi;
pub mod binary;
pub mod cache;
pub mod claude;
pub mod codex;
pub mod contract;
pub mod custom;
pub mod environment;
pub mod error;
pub mod gemini;
pub mod json;
pub mod process;
pub mod registry;
pub mod shared;

pub use claude::ClaudeAdapter;
pub use codex::CodexAdapter;
pub use contract::{AdapterRequest, AdapterResult, PermissionMode, Usage};
pub use custom::CustomCliAdapter;
pub use error::AdapterError;
pub use gemini::GeminiAdapter;
pub use registry::AdapterRegistry;

/// A CLI adapter drives one assistant's command-line tool: it constructs the
/// invocation, runs it (through an injected runner), and maps the structured
/// output or failure onto the typed contract (`docs/idea.md` §9).
#[async_trait]
pub trait CliAdapter: Send + Sync {
    /// Which assistant this adapter drives.
    fn id(&self) -> AssistantId;

    /// Run one request to completion (blocking output, MVP). `cancel` is the
    /// per-run cancellation hook (§7).
    async fn run(
        &self,
        req: AdapterRequest,
        cancel: CancellationToken,
    ) -> Result<AdapterResult, AdapterError>;
}

/// Identifies which local CLI an adapter drives.
///
/// The three built-ins are unit variants; [`AssistantId::Custom`] carries the
/// user-supplied display name of a user-registered CLI (SP-072). The enum is no
/// longer `Copy` because the custom variant owns a `String`.
///
/// Wire form (serde external tagging with lowercase keys): built-ins serialize
/// as the bare strings `"codex"`/`"claude"`/`"gemini"`; a custom provider
/// serializes as `{ "custom": "<name>" }`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub enum AssistantId {
    Codex,
    Claude,
    Gemini,
    /// A user-registered CLI, identified by its display name (SP-072).
    Custom(String),
}

impl AssistantId {
    /// Stable identifier/key form used for run ids, the message `assistant_id`
    /// column, and per-provider send tracking. Built-ins use their lowercase
    /// name; a custom provider is namespaced as `custom:<name>` so it can never
    /// collide with a built-in key and round-trips through [`FromStr`].
    pub fn as_str(&self) -> Cow<'static, str> {
        match self {
            AssistantId::Codex => Cow::Borrowed("codex"),
            AssistantId::Claude => Cow::Borrowed("claude"),
            AssistantId::Gemini => Cow::Borrowed("gemini"),
            AssistantId::Custom(name) => Cow::Owned(format!("custom:{name}")),
        }
    }

    /// Human-readable provider name used for labeled transcript replay, e.g. the
    /// `[Codex said]:` prefix on a prior response from another provider (SP-016, §6).
    /// A custom provider reports its user-supplied name verbatim.
    pub fn display_name(&self) -> Cow<'static, str> {
        match self {
            AssistantId::Codex => Cow::Borrowed("Codex"),
            AssistantId::Claude => Cow::Borrowed("Claude"),
            AssistantId::Gemini => Cow::Borrowed("Gemini"),
            AssistantId::Custom(name) => Cow::Owned(name.clone()),
        }
    }

    /// Whether this id identifies a user-registered custom CLI (SP-072).
    pub fn is_custom(&self) -> bool {
        matches!(self, AssistantId::Custom(_))
    }
}

impl FromStr for AssistantId {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        // Custom keys are stored verbatim after the `custom:` prefix and must
        // preserve their original case (the display name is case-sensitive).
        if let Some(name) = value.strip_prefix("custom:") {
            return Ok(AssistantId::Custom(name.to_string()));
        }
        match value.to_ascii_lowercase().as_str() {
            "codex" => Ok(AssistantId::Codex),
            "claude" => Ok(AssistantId::Claude),
            "gemini" => Ok(AssistantId::Gemini),
            other => Err(format!("unknown assistant id: {other}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_ids_case_insensitively() {
        assert_eq!("Codex".parse(), Ok(AssistantId::Codex));
        assert_eq!("claude".parse(), Ok(AssistantId::Claude));
        assert_eq!("GEMINI".parse(), Ok(AssistantId::Gemini));
    }

    #[test]
    fn round_trips_through_as_str() {
        for id in [AssistantId::Codex, AssistantId::Claude, AssistantId::Gemini] {
            assert_eq!(id.as_str().parse(), Ok(id.clone()));
        }
    }

    #[test]
    fn rejects_unknown_ids() {
        assert!("openai".parse::<AssistantId>().is_err());
    }

    #[test]
    fn custom_round_trips_through_as_str_preserving_case() {
        let id = AssistantId::Custom("OpenCode".to_string());
        assert_eq!(id.as_str(), "custom:OpenCode");
        assert_eq!(id.as_str().parse(), Ok(id));
    }

    #[test]
    fn custom_display_name_is_the_user_supplied_name() {
        assert_eq!(
            AssistantId::Custom("OpenCode".to_string()).display_name(),
            "OpenCode"
        );
    }

    #[test]
    fn custom_serializes_externally_tagged_and_builtins_stay_bare_strings() {
        assert_eq!(
            serde_json::to_value(AssistantId::Codex).unwrap(),
            serde_json::json!("codex")
        );
        assert_eq!(
            serde_json::to_value(AssistantId::Custom("OpenCode".to_string())).unwrap(),
            serde_json::json!({ "custom": "OpenCode" })
        );
        // And it round-trips back through serde.
        let parsed: AssistantId =
            serde_json::from_value(serde_json::json!({ "custom": "OpenCode" })).unwrap();
        assert_eq!(parsed, AssistantId::Custom("OpenCode".to_string()));
    }

    #[test]
    fn is_custom_distinguishes_user_clis_from_builtins() {
        assert!(AssistantId::Custom("x".to_string()).is_custom());
        assert!(!AssistantId::Codex.is_custom());
    }
}
