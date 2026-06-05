//! Storage error taxonomy.
//!
//! Mirrors the adapter error convention (`adapters::error`): a single enum
//! serialized internally-tagged (`{"kind": "..."}`) with camelCase variant
//! names, so the React UI can branch on `error.kind` uniformly when a storage
//! command fails (SP-007 — "storage failures return typed errors to the UI").

use serde::{Deserialize, Serialize};

/// Failure modes for the local SQLite store.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StorageError {
    /// A referenced entity (session, message) does not exist.
    NotFound { entity: String },
    /// A SQL query or connection operation failed.
    Query { detail: String },
    /// The store cannot be used safely because its connection state is suspect.
    StorageUnavailable { detail: String },
    /// The database was created by a newer schema than this binary supports.
    UnsupportedSchemaVersion { found: i64, supported: i64 },
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::NotFound { entity } => write!(f, "not found: {entity}"),
            StorageError::Query { detail } => write!(f, "storage query failed: {detail}"),
            StorageError::StorageUnavailable { detail } => {
                write!(f, "storage unavailable: {detail}")
            }
            StorageError::UnsupportedSchemaVersion { found, supported } => write!(
                f,
                "unsupported storage schema version {found}; supported version is {supported}"
            ),
        }
    }
}

impl std::error::Error for StorageError {}

impl From<rusqlite::Error> for StorageError {
    fn from(err: rusqlite::Error) -> Self {
        StorageError::Query {
            detail: err.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_found_serializes_with_kind_tag() {
        let json = serde_json::to_value(StorageError::NotFound {
            entity: "session".to_string(),
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "notFound", "entity": "session" })
        );
    }

    #[test]
    fn query_error_round_trips_through_serde() {
        let original = StorageError::Query {
            detail: "near \"FROM\": syntax error".to_string(),
        };
        let json = serde_json::to_string(&original).unwrap();
        let parsed: StorageError = serde_json::from_str(&json).unwrap();
        assert_eq!(original, parsed);
    }

    #[test]
    fn storage_unavailable_serializes_with_kind_tag() {
        let json = serde_json::to_value(StorageError::StorageUnavailable {
            detail: "connection mutex poisoned".to_string(),
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "kind": "storageUnavailable",
                "detail": "connection mutex poisoned"
            })
        );
    }
}
