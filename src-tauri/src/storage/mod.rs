//! Local persistence seam (SP-007).
//!
//! Chat sessions, messages, and the native Codex session reference are stored
//! in SQLite (see `docs/idea.md` §"Local Storage" and §"Session Model"). The
//! local store is the display/history source of truth regardless of how
//! model-context continuity is carried (§6).
//!
//! - [`Store`] — the SQLite-backed data-access layer (bundled `rusqlite`).
//! - [`model`] — the typed session/message values that cross the IPC boundary.
//! - [`StorageError`] — typed failures surfaced to the UI.

pub mod error;
pub mod model;
pub mod store;

pub use error::StorageError;
pub use model::{Message, NewMessage, Sender, Session};
pub use store::Store;
