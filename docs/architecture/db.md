# Database Architecture — side-pilot

See `docs/architecture/README.md` for the source tree overview and file routing table.

---

## Storage Layer (`src-tauri/src/storage/`)

Single `rusqlite::Connection` behind a `Mutex`, managed as Tauri state:

The store uses `PRAGMA user_version` with `CURRENT_SCHEMA_VERSION = 2`. Migrations
are applied stepwise and additively (version 0 → base schema; version 1 → the
`message_provider_sends` table) without dropping existing data; databases with a
future schema version fail explicitly.

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
  content      TEXT NOT NULL,
  raw_json     TEXT,
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
```

### Key Operations

| Operation | Behavior |
|---|---|
| `create_session` | Inserts row with generated UUID, optional title |
| `append_message` | Auto-assigns `seq` as `MAX(seq) + 1` per session; bumps session `updated_at` |
| `read_history` | Reads messages `ORDER BY seq ASC` for a session |
| `list_sessions` | `ORDER BY updated_at DESC, id ASC` |
| `rename_session` | Updates title; `updated_at` unchanged (rename is not a message) |
| `delete_session` | Cascade deletes messages (`ON DELETE CASCADE`) |
| `clear_session` | Deletes messages + nulls `codex_session_id`; preserves session, `updated_at` unchanged |
| `update_codex_session_id` | Saves native CLI resume id; bumps `updated_at` |
| `mark_message_sent` | Records `(message_id, provider)` in `message_provider_sends`; idempotent (`INSERT OR IGNORE`) |
| `unsent_messages` | Per-provider diff: messages in a session with no send row for `provider`, ordered by `seq` |

### Storage Errors

Storage failures cross IPC as `StorageError` variants:
- `notFound`
- `query`
- `storageUnavailable`
- `unsupportedSchemaVersion`

### Schema Versioning

- `CURRENT_SCHEMA_VERSION = 2`
- Stepwise migration: version < 1 applies the base schema; version < 2 adds `message_provider_sends`
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
