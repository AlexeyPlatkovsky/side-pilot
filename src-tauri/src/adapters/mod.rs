//! CLI adapter seam.
//!
//! Each assistant (OpenAI Codex, Claude Code, Gemini) is driven through its
//! non-interactive structured-output mode per `docs/idea.md` §"CLI Invocation
//! Contract". The concrete adapters and the `CliAdapter` trait arrive in SP-008
//! / SP-009. The scaffold defines only the shared assistant identity so the
//! routing layer and storage have a stable type to reference.

use std::str::FromStr;

/// Identifies which local CLI an adapter drives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
