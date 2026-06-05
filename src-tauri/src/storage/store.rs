//! SQLite-backed session/message store (SP-007).
//!
//! The local store is the display/history source of truth (`docs/idea.md` §6).
//! It owns a single [`rusqlite::Connection`] behind a [`Mutex`] so it can live
//! in Tauri managed state and be called from async commands; every operation
//! locks, runs a short synchronous query, and releases — no lock is held across
//! an `.await`.
//!
//! SQLite is bundled (no system dependency). Tests run against an in-memory
//! database so storage logic is verified without touching the filesystem.

use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use super::error::StorageError;
use super::model::{Message, NewMessage, Sender, Session};

/// Current schema version, applied via `PRAGMA user_version`.
const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS sessions (
    id               TEXT PRIMARY KEY,
    title            TEXT,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    codex_session_id TEXT
);
CREATE TABLE IF NOT EXISTS messages (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq          INTEGER NOT NULL,
    sender       TEXT NOT NULL,
    assistant_id TEXT,
    content      TEXT NOT NULL,
    raw_json     TEXT,
    created_at   INTEGER NOT NULL,
    UNIQUE (session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages (session_id, seq);
";

/// Local SQLite store for chat sessions and messages.
pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    /// Open (creating if needed) a store at `path` and ensure the schema exists.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
        Self::from_connection(conn)
    }

    /// Open an in-memory store. Used by tests and ephemeral contexts.
    pub fn in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory()?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self, StorageError> {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        // The mutex is only poisoned if a prior holder panicked mid-query;
        // recovering the guard is safe because every operation is atomic.
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Create a new session and return it.
    pub fn create_session(&self, title: Option<String>) -> Result<Session, StorageError> {
        let now = now_millis();
        let session = Session {
            id: Uuid::new_v4().to_string(),
            title,
            created_at: now,
            updated_at: now,
            codex_session_id: None,
        };
        let conn = self.lock();
        conn.execute(
            "INSERT INTO sessions (id, title, created_at, updated_at, codex_session_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                session.id,
                session.title,
                session.created_at,
                session.updated_at,
                session.codex_session_id
            ],
        )?;
        Ok(session)
    }

    /// Append a message to a session, assigning the next sequence number and a
    /// fresh id. Bumps the session's `updated_at`. Fails with `NotFound` if the
    /// session does not exist.
    pub fn append_message(&self, input: NewMessage) -> Result<Message, StorageError> {
        let conn = self.lock();
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM sessions WHERE id = ?1",
                params![input.session_id],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);
        if !exists {
            return Err(StorageError::NotFound {
                entity: format!("session {}", input.session_id),
            });
        }

        let next_seq: i64 = conn.query_row(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE session_id = ?1",
            params![input.session_id],
            |row| row.get(0),
        )?;
        let now = now_millis();
        let message = Message {
            id: Uuid::new_v4().to_string(),
            session_id: input.session_id,
            seq: next_seq,
            sender: input.sender,
            assistant_id: input.assistant_id,
            content: input.content,
            raw_json: input.raw_json,
            created_at: now,
        };
        conn.execute(
            "INSERT INTO messages
               (id, session_id, seq, sender, assistant_id, content, raw_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                message.id,
                message.session_id,
                message.seq,
                message.sender.as_str(),
                message.assistant_id,
                message.content,
                message.raw_json,
                message.created_at
            ],
        )?;
        conn.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, message.session_id],
        )?;
        Ok(message)
    }

    /// Read a session's messages in send order (ascending `seq`).
    pub fn read_history(&self, session_id: &str) -> Result<Vec<Message>, StorageError> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, seq, sender, assistant_id, content, raw_json, created_at
             FROM messages WHERE session_id = ?1 ORDER BY seq ASC",
        )?;
        let rows = stmt.query_map(params![session_id], row_to_message)?;
        let mut messages = Vec::new();
        for row in rows {
            messages.push(row?);
        }
        Ok(messages)
    }

    /// List all sessions, most recently updated first.
    pub fn list_sessions(&self) -> Result<Vec<Session>, StorageError> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, created_at, updated_at, codex_session_id
             FROM sessions ORDER BY updated_at DESC, id ASC",
        )?;
        let rows = stmt.query_map([], row_to_session)?;
        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    /// Rename a session, returning the updated row. `updated_at` is left
    /// untouched: the list is ordered by latest-message time (SP-049), and a
    /// rename is not a message, so it must not reorder the chat. Fails with
    /// `NotFound` if the session does not exist.
    pub fn rename_session(
        &self,
        session_id: &str,
        title: Option<String>,
    ) -> Result<Session, StorageError> {
        let conn = self.lock();
        let changed = conn.execute(
            "UPDATE sessions SET title = ?1 WHERE id = ?2",
            params![title, session_id],
        )?;
        if changed == 0 {
            return Err(StorageError::NotFound {
                entity: format!("session {session_id}"),
            });
        }
        load_session(&conn, session_id)
    }

    /// Delete a session and all of its messages (cascade). Fails with
    /// `NotFound` if the session does not exist.
    pub fn delete_session(&self, session_id: &str) -> Result<(), StorageError> {
        let conn = self.lock();
        let changed = conn.execute(
            "DELETE FROM sessions WHERE id = ?1",
            params![session_id],
        )?;
        if changed == 0 {
            return Err(StorageError::NotFound {
                entity: format!("session {session_id}"),
            });
        }
        Ok(())
    }

    /// Clear a session's contents (SP-051): delete every message and reset the
    /// native Codex resume id so future prompts do not resume stale context.
    /// The session row survives so it stays selectable as an empty chat.
    /// `updated_at` is left untouched: clearing is not a message, so (like
    /// rename, SP-049) it must not reorder the latest-message-ordered rail.
    /// Fails with `NotFound` if the session does not exist.
    pub fn clear_session(&self, session_id: &str) -> Result<Session, StorageError> {
        let conn = self.lock();
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM sessions WHERE id = ?1",
                params![session_id],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);
        if !exists {
            return Err(StorageError::NotFound {
                entity: format!("session {session_id}"),
            });
        }
        conn.execute(
            "DELETE FROM messages WHERE session_id = ?1",
            params![session_id],
        )?;
        conn.execute(
            "UPDATE sessions SET codex_session_id = NULL WHERE id = ?1",
            params![session_id],
        )?;
        load_session(&conn, session_id)
    }

    /// Record the native Codex session id for a local session (§6, resume).
    pub fn update_codex_session_id(
        &self,
        session_id: &str,
        codex_session_id: &str,
    ) -> Result<(), StorageError> {
        let conn = self.lock();
        let changed = conn.execute(
            "UPDATE sessions SET codex_session_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![codex_session_id, now_millis(), session_id],
        )?;
        if changed == 0 {
            return Err(StorageError::NotFound {
                entity: format!("session {session_id}"),
            });
        }
        Ok(())
    }
}

/// Read a single session by id from an already-held connection. Used by the
/// mutating helpers that need to return the post-update row.
fn load_session(conn: &Connection, session_id: &str) -> Result<Session, StorageError> {
    conn.query_row(
        "SELECT id, title, created_at, updated_at, codex_session_id
         FROM sessions WHERE id = ?1",
        params![session_id],
        row_to_session,
    )
    .optional()?
    .ok_or_else(|| StorageError::NotFound {
        entity: format!("session {session_id}"),
    })
}

fn row_to_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
        codex_session_id: row.get(4)?,
    })
}

fn row_to_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<Message> {
    let sender_text: String = row.get(3)?;
    let sender = Sender::from_str(&sender_text).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            3,
            rusqlite::types::Type::Text,
            format!("unknown sender: {sender_text}").into(),
        )
    })?;
    Ok(Message {
        id: row.get(0)?,
        session_id: row.get(1)?,
        seq: row.get(2)?,
        sender,
        assistant_id: row.get(4)?,
        content: row.get(5)?,
        raw_json: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user_msg(session_id: &str, content: &str) -> NewMessage {
        NewMessage {
            session_id: session_id.to_string(),
            sender: Sender::User,
            assistant_id: None,
            content: content.to_string(),
            raw_json: None,
        }
    }

    fn assistant_msg(session_id: &str, content: &str) -> NewMessage {
        NewMessage {
            session_id: session_id.to_string(),
            sender: Sender::Assistant,
            assistant_id: Some("codex".to_string()),
            content: content.to_string(),
            raw_json: Some("{\"type\":\"turn.completed\"}".to_string()),
        }
    }

    #[test]
    fn create_session_persists_a_retrievable_session() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(Some("First chat".to_string())).unwrap();

        assert!(!session.id.is_empty());
        assert_eq!(session.title.as_deref(), Some("First chat"));
        assert_eq!(session.codex_session_id, None);

        let listed = store.list_sessions().unwrap();
        assert_eq!(listed, vec![session]);
    }

    #[test]
    fn append_message_assigns_increasing_sequence() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();

        let first = store.append_message(user_msg(&session.id, "hello")).unwrap();
        let second = store
            .append_message(assistant_msg(&session.id, "hi back"))
            .unwrap();

        assert_eq!(first.seq, 1);
        assert_eq!(second.seq, 2);
        assert_ne!(first.id, second.id);
        assert_eq!(second.assistant_id.as_deref(), Some("codex"));
    }

    #[test]
    fn read_history_returns_messages_in_send_order() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();
        store.append_message(user_msg(&session.id, "one")).unwrap();
        store.append_message(assistant_msg(&session.id, "two")).unwrap();
        store.append_message(user_msg(&session.id, "three")).unwrap();

        let history = store.read_history(&session.id).unwrap();
        let contents: Vec<&str> = history.iter().map(|m| m.content.as_str()).collect();
        assert_eq!(contents, vec!["one", "two", "three"]);
        assert_eq!(history.iter().map(|m| m.seq).collect::<Vec<_>>(), vec![1, 2, 3]);
    }

    #[test]
    fn read_history_scopes_messages_to_their_session() {
        let store = Store::in_memory().unwrap();
        let a = store.create_session(None).unwrap();
        let b = store.create_session(None).unwrap();
        store.append_message(user_msg(&a.id, "for a")).unwrap();
        store.append_message(user_msg(&b.id, "for b")).unwrap();

        let history_a = store.read_history(&a.id).unwrap();
        assert_eq!(history_a.len(), 1);
        assert_eq!(history_a[0].content, "for a");
        // Sequence restarts per session.
        assert_eq!(history_a[0].seq, 1);
    }

    #[test]
    fn append_message_to_unknown_session_is_not_found() {
        let store = Store::in_memory().unwrap();
        let err = store.append_message(user_msg("nope", "hi")).unwrap_err();
        assert!(matches!(err, StorageError::NotFound { .. }));
    }

    #[test]
    fn update_codex_session_id_records_native_session() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();

        store
            .update_codex_session_id(&session.id, "thread-abc")
            .unwrap();

        let reloaded = store.list_sessions().unwrap().pop().unwrap();
        assert_eq!(reloaded.codex_session_id.as_deref(), Some("thread-abc"));
    }

    #[test]
    fn update_codex_session_id_for_unknown_session_is_not_found() {
        let store = Store::in_memory().unwrap();
        let err = store
            .update_codex_session_id("missing", "x")
            .unwrap_err();
        assert!(matches!(err, StorageError::NotFound { .. }));
    }

    #[test]
    fn rename_session_updates_title_without_reordering() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(Some("old".to_string())).unwrap();
        // A message bumps updated_at; the rename must not change it (sort order
        // is by latest message, and a rename is not a message).
        store.append_message(user_msg(&session.id, "hi")).unwrap();
        let before = store.list_sessions().unwrap().pop().unwrap();

        let renamed = store
            .rename_session(&session.id, Some("new title".to_string()))
            .unwrap();

        assert_eq!(renamed.title.as_deref(), Some("new title"));
        assert_eq!(renamed.updated_at, before.updated_at);
        let reloaded = store.list_sessions().unwrap().pop().unwrap();
        assert_eq!(reloaded.title.as_deref(), Some("new title"));
        assert_eq!(reloaded.updated_at, before.updated_at);
    }

    #[test]
    fn rename_session_for_unknown_session_is_not_found() {
        let store = Store::in_memory().unwrap();
        let err = store
            .rename_session("missing", Some("x".to_string()))
            .unwrap_err();
        assert!(matches!(err, StorageError::NotFound { .. }));
    }

    #[test]
    fn delete_session_removes_session_and_cascades_messages() {
        let store = Store::in_memory().unwrap();
        let keep = store.create_session(Some("keep".to_string())).unwrap();
        let drop = store.create_session(Some("drop".to_string())).unwrap();
        store.append_message(user_msg(&drop.id, "one")).unwrap();
        store.append_message(assistant_msg(&drop.id, "two")).unwrap();

        store.delete_session(&drop.id).unwrap();

        let remaining: Vec<String> =
            store.list_sessions().unwrap().into_iter().map(|s| s.id).collect();
        assert_eq!(remaining, vec![keep.id]);
        // Messages of the deleted session are gone (cascade), so re-reading is empty.
        assert!(store.read_history(&drop.id).unwrap().is_empty());
    }

    #[test]
    fn delete_session_for_unknown_session_is_not_found() {
        let store = Store::in_memory().unwrap();
        let err = store.delete_session("missing").unwrap_err();
        assert!(matches!(err, StorageError::NotFound { .. }));
    }

    #[test]
    fn clear_session_deletes_messages_and_resets_codex_id() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(Some("chat".to_string())).unwrap();
        store.append_message(user_msg(&session.id, "one")).unwrap();
        store.append_message(assistant_msg(&session.id, "two")).unwrap();
        store
            .update_codex_session_id(&session.id, "thread-stale")
            .unwrap();
        // updated_at as it stands after the last write, before clearing.
        let before = store.list_sessions().unwrap().pop().unwrap();
        // Force a wall-clock gap so a (regressed) bump to now would be visible
        // rather than colliding within the same millisecond.
        std::thread::sleep(std::time::Duration::from_millis(2));

        let cleared = store.clear_session(&session.id).unwrap();

        // Session itself survives (still selectable as an empty chat) but its
        // title is kept while messages and the native resume id are cleared.
        assert_eq!(cleared.title.as_deref(), Some("chat"));
        assert_eq!(cleared.codex_session_id, None);
        // Clearing is not a message, so it must not bump updated_at / reorder
        // the rail (matches rename semantics, SP-049/SP-051).
        assert_eq!(cleared.updated_at, before.updated_at);
        assert!(store.read_history(&session.id).unwrap().is_empty());
        let reloaded = store.list_sessions().unwrap().pop().unwrap();
        assert_eq!(reloaded.codex_session_id, None);
        assert_eq!(reloaded.updated_at, before.updated_at);
        // Next appended message restarts the sequence at 1.
        let next = store.append_message(user_msg(&session.id, "fresh")).unwrap();
        assert_eq!(next.seq, 1);
    }

    #[test]
    fn clear_session_for_unknown_session_is_not_found() {
        let store = Store::in_memory().unwrap();
        let err = store.clear_session("missing").unwrap_err();
        assert!(matches!(err, StorageError::NotFound { .. }));
    }

    #[test]
    fn messages_reload_from_a_reopened_database() {
        let dir = std::env::temp_dir().join(format!("sidepilot-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("history.db");

        let session_id = {
            let store = Store::open(&db_path).unwrap();
            let session = store.create_session(None).unwrap();
            store.append_message(user_msg(&session.id, "persist me")).unwrap();
            session.id
        };

        // Reopen — simulating an app restart — and confirm the row survived.
        let store = Store::open(&db_path).unwrap();
        let history = store.read_history(&session_id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].content, "persist me");

        std::fs::remove_dir_all(&dir).ok();
    }
}
