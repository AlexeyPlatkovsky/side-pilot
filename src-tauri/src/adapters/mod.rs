//! CLI adapter seam.
//!
//! Each assistant (OpenAI Codex, Claude Code, Gemini) is driven through its
//! non-interactive structured-output mode per `docs/idea.md` §"CLI Invocation
//! Contract". The MVP (SP-008) delivers the [`CliAdapter`] trait, the typed
//! request/result/error contract, binary resolution, the subprocess seam, the
//! routing [`AdapterRegistry`], and one registered [`CodexAdapter`].

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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub enum AssistantId {
    Codex,
    Claude,
    Gemini,
}

impl AssistantId {
    /// Stable lowercase wire/identifier form.
    pub fn as_str(self) -> &'static str {
        match self {
            AssistantId::Codex => "codex",
            AssistantId::Claude => "claude",
            AssistantId::Gemini => "gemini",
        }
    }

    /// Human-readable provider name used for labeled transcript replay, e.g. the
    /// `[Codex said]:` prefix on a prior response from another provider (SP-016, §6).
    pub fn display_name(self) -> &'static str {
        match self {
            AssistantId::Codex => "Codex",
            AssistantId::Claude => "Claude",
            AssistantId::Gemini => "Gemini",
        }
    }
}

impl FromStr for AssistantId {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
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
            assert_eq!(id.as_str().parse(), Ok(id));
        }
    }

    #[test]
    fn rejects_unknown_ids() {
        assert!("openai".parse::<AssistantId>().is_err());
    }
}
