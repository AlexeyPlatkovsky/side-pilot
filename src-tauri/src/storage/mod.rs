//! Local persistence seam.
//!
//! Chat sessions, messages, and CLI session references are stored in SQLite
//! (see `docs/idea.md` §"Local Storage" and §"Session Model"). The schema and
//! data-access layer arrive in SP-007; the scaffold defines only the module
//! location so the rest of the core can depend on a stable path.
