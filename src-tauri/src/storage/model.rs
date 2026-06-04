//! Local session/message data model.
//!
//! These types are the source of truth for chat display and history
//! (`docs/idea.md` §"Session Model"). They cross the Tauri IPC boundary, so
//! field names serialize as camelCase to match the TypeScript side. The local
//! store keeps every message regardless of how model-context continuity is
//! carried; `codex_session_id` records the native Codex session for resume
//! (§6).

use serde::{Deserialize, Serialize};

/// Who authored a message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sender {
    User,
    Assistant,
}

impl Sender {
    /// Stable lowercase form used as the SQLite column value.
    pub fn as_str(self) -> &'static str {
        match self {
            Sender::User => "user",
            Sender::Assistant => "assistant",
        }
    }

    /// Parse the stored column value back into a [`Sender`].
    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "user" => Some(Sender::User),
            "assistant" => Some(Sender::Assistant),
            _ => None,
        }
    }
}

/// One local conversation. The local id is the display/history source of
/// truth; `codex_session_id` is the optional native CLI session for resume.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub codex_session_id: Option<String>,
}

/// One persisted message within a session, ordered by `seq`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub seq: i64,
    pub sender: Sender,
    /// Which assistant produced an assistant message (`codex` for the MVP).
    /// `None` for user messages.
    pub assistant_id: Option<String>,
    pub content: String,
    /// Raw routing metadata / structured CLI output retained for inspection.
    pub raw_json: Option<String>,
    pub created_at: i64,
}

/// Input for appending a message; the store assigns `id`, `seq`, and timestamp.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessage {
    pub session_id: String,
    pub sender: Sender,
    #[serde(default)]
    pub assistant_id: Option<String>,
    pub content: String,
    #[serde(default)]
    pub raw_json: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sender_round_trips_through_str() {
        for sender in [Sender::User, Sender::Assistant] {
            assert_eq!(Sender::from_str(sender.as_str()), Some(sender));
        }
        assert_eq!(Sender::from_str("bogus"), None);
    }

    #[test]
    fn message_serializes_camel_case() {
        let message = Message {
            id: "m1".to_string(),
            session_id: "s1".to_string(),
            seq: 1,
            sender: Sender::Assistant,
            assistant_id: Some("codex".to_string()),
            content: "pong".to_string(),
            raw_json: None,
            created_at: 42,
        };
        let json = serde_json::to_value(&message).unwrap();
        assert_eq!(json["sessionId"], "s1");
        assert_eq!(json["assistantId"], "codex");
        assert_eq!(json["sender"], "assistant");
        assert_eq!(json["createdAt"], 42);
    }

    #[test]
    fn new_message_deserializes_with_optional_defaults() {
        let json = serde_json::json!({
            "sessionId": "s1",
            "sender": "user",
            "content": "hi",
        });
        let msg: NewMessage = serde_json::from_value(json).unwrap();
        assert_eq!(msg.session_id, "s1");
        assert_eq!(msg.sender, Sender::User);
        assert_eq!(msg.assistant_id, None);
        assert_eq!(msg.raw_json, None);
    }
}
