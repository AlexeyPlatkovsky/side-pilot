# Database Architecture — side-pilot

See `docs/architecture/README.md` for the source tree overview and file routing table.

---

## Storage Layer (`src-tauri/src/storage/`)

Single `rusqlite::Connection` behind a `Mutex`, managed as Tauri state:

The store uses `PRAGMA user_version` with `CURRENT_SCHEMA_VERSION = 5`. Migrations
are applied stepwise and additively (version < 1 → base schema; version < 2 → the
`message_provider_sends` table; version < 3 → the display-only message error flag;
version < 4 → snapshotted `model`/`reasoning_effort` reply metadata; version < 5 →
the `provider_sessions` native-resume table) without dropping existing data;
databases with a future schema version fail explicitly.

### Schema

```sql
sessions (
  id               TEXT PRIMARY KEY,
  title            TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  codex_session_id TEXT
);

messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  sender       TEXT NOT NULL,
  assistant_id TEXT,
  model        TEXT,
  reasoning_effort TEXT,
  content      TEXT NOT NULL,
  raw_json     TEXT,
  is_error     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  UNIQUE (session_id, seq)
);

CREATE INDEX idx_messages_session_seq ON messages (session_id, seq);

-- Added in schema version 2 (SP-016): tracks which providers have already
-- received each message, so a per-provider send includes only the messages
-- that provider has not yet seen (app-owned transcript replay, idea.md §6).
message_provider_sends (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  sent_at    INTEGER NOT NULL,
  PRIMARY KEY (message_id, provider)
);

CREATE INDEX idx_provider_sends_provider ON message_provider_sends (provider, message_id);

-- Added in schema version 5 (SP-011): the native CLI session id each provider
-- reported for a chat, so the route path can resume a provider's own session
-- across turns (idea.md §6 resume) instead of starting a fresh, context-less
-- process. One row per (session, provider); the latest id wins (resume can fork
-- the id). All three CLIs resume by UUID (Claude -r, Codex resume, Gemini
-- --resume); a provider that records no id falls back to transcript replay.
provider_sessions (
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (session_id, provider)
);
```

### Key Operations

| Operation | Behavior |
|---|---|
| `create_session` | Inserts row with generated UUID, optional title |
| `append_message` | Auto-assigns `seq` as `MAX(seq) + 1` per session; bumps session `updated_at` |
| `append_error_message` | Persists a provider failure for display/history with `is_error = 1`; Rust routing-only, not exposed as an IPC command |
| `read_history` | Reads messages `ORDER BY seq ASC` for a session |
| `list_sessions` | `ORDER BY updated_at DESC, id ASC` |
| `rename_session` | Updates title; `updated_at` unchanged (rename is not a message) |
| `delete_session` | Cascade deletes messages (`ON DELETE CASCADE`) |
| `clear_session` | Deletes messages + `provider_sessions` rows + nulls `codex_session_id`; preserves session, `updated_at` unchanged |
| `update_codex_session_id` | Saves the legacy single native CLI resume id on `sessions`; bumps `updated_at` |
| `mark_message_sent` | Records `(message_id, provider)` in `message_provider_sends`; idempotent (`INSERT OR IGNORE`) |
| `unsent_messages` | Per-provider diff: non-error messages in a session with no send row for `provider`, ordered by `seq`; display-only errors are never replayed |
| `native_session_id` | Reads the native CLI session id recorded for `(session, provider)` in `provider_sessions`, or `None` |
| `set_native_session_id` | Upserts `(session, provider) → native_session_id` (`ON CONFLICT DO UPDATE`, latest id wins) |

### Storage Errors

Storage failures cross IPC as `StorageError` variants:
- `notFound`
- `query`
- `storageUnavailable`
- `unsupportedSchemaVersion`

### Schema Versioning

- `CURRENT_SCHEMA_VERSION = 5`
- Stepwise migration: version < 1 applies the base schema; version < 2 adds `message_provider_sends`; version < 3 atomically adds `messages.is_error`; version < 4 adds the snapshotted `model` and `reasoning_effort` reply metadata; version < 5 adds the `provider_sessions` native-resume table
- Each step is `CREATE TABLE IF NOT EXISTS` + indexes; existing v0/v1 databases upgrade in place
- Version > current: rejected with `UnsupportedSchemaVersion`
- Migration is additive only — no data loss on upgrade

### Source Files

| File | Purpose |
|---|---|
| `src-tauri/src/storage/store.rs` | SQLite store CRUD, schema constant, migration logic |
| `src-tauri/src/storage/model.rs` | `Session`, `Message`, `NewMessage`, `Sender` types |
| `src-tauri/src/storage/error.rs` | `StorageError` taxonomy |
| `src-tauri/src/storage/mod.rs` | Module re-exports |
