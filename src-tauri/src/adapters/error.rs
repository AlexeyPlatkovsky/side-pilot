//! Shared adapter error taxonomy.
//!
//! Every CLI adapter maps its failure modes onto this single enum so the React
//! UI can branch on `error.kind` uniformly — see `docs/idea.md` §8 "Error
//! taxonomy". The enum is serialized internally-tagged (`{"kind": "..."}`) with
//! camelCase variant names to match the front-end IPC conventions.

use serde::{Deserialize, Serialize};

/// Shared failure taxonomy for all CLI adapters (CLI Invocation Contract §8).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AdapterError {
    /// The CLI executable could not be resolved to an absolute path (§2).
    BinaryNotFound,
    /// The CLI ran but reported missing or invalid authentication.
    NotAuthenticated,
    /// The CLI exited with a non-zero status not otherwise classified.
    NonZeroExit { code: Option<i32>, stderr: String },
    /// The per-adapter timeout elapsed; the process was terminated (§7).
    TimedOut,
    /// Structured output was missing or malformed (§5).
    OutputParseFailure { detail: String },
    /// The user cancelled the in-flight run; the process was terminated (§7).
    Cancelled,
}

impl std::fmt::Display for AdapterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AdapterError::BinaryNotFound => write!(f, "CLI executable not found"),
            AdapterError::NotAuthenticated => {
                write!(f, "CLI is not authenticated")
            }
            AdapterError::NonZeroExit { code, stderr } => match code {
                Some(code) => write!(f, "CLI exited with status {code}: {stderr}"),
                None => write!(f, "CLI terminated by signal: {stderr}"),
            },
            AdapterError::TimedOut => write!(f, "CLI run timed out"),
            AdapterError::OutputParseFailure { detail } => {
                write!(f, "failed to parse CLI output: {detail}")
            }
            AdapterError::Cancelled => write!(f, "CLI run was cancelled"),
        }
    }
}

impl std::error::Error for AdapterError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unit_variants_serialize_with_kind_tag() {
        let json = serde_json::to_value(AdapterError::BinaryNotFound).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "binaryNotFound" }));

        let json = serde_json::to_value(AdapterError::Cancelled).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "cancelled" }));
    }

    #[test]
    fn non_zero_exit_serializes_code_and_stderr() {
        let json = serde_json::to_value(AdapterError::NonZeroExit {
            code: Some(2),
            stderr: "boom".to_string(),
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "nonZeroExit", "code": 2, "stderr": "boom" })
        );
    }

    #[test]
    fn round_trips_through_serde() {
        let original = AdapterError::OutputParseFailure {
            detail: "no agent_message event".to_string(),
        };
        let json = serde_json::to_string(&original).unwrap();
        let parsed: AdapterError = serde_json::from_str(&json).unwrap();
        assert_eq!(original, parsed);
    }
}
