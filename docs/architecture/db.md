# Database Architecture — side-pilot

See `docs/architecture/README.md` for the source tree overview and file routing table.

---

## Storage Layer (`src-tauri/src/storage/`)

Single `rusqlite::Connection` behind a `Mutex`, managed as Tauri state:

The store uses `PRAGMA user_version` with `CURRENT_SCHEMA_VERSION = 1`. Version
0 databases are migrated by creating the current schema and indexes without
dropping existing data; databases with a future schema version fail explicitly.

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

### Storage Errors

Storage failures cross IPC as `StorageError` variants:
- `notFound`
- `query`
- `storageUnavailable`
- `unsupportedSchemaVersion`

### Schema Versioning

- `CURRENT_SCHEMA_VERSION = 1`
- Version 0 → current: migration runs `CREATE TABLE IF NOT EXISTS` + indexes
- Version > current: rejected with `UnsupportedSchemaVersion`
- Migration is additive only — no data loss on upgrade

### Source Files

| File | Purpose |
|---|---|
| `src-tauri/src/storage/store.rs` | SQLite store CRUD, schema constant, migration logic |
| `src-tauri/src/storage/model.rs` | `Session`, `Message`, `NewMessage`, `Sender` types |
| `src-tauri/src/storage/error.rs` | `StorageError` taxonomy |
| `src-tauri/src/storage/mod.rs` | Module re-exports |
