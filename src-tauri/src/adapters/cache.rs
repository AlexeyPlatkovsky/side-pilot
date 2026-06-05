//! Per-assistant lookup cache shared by the binary and environment resolvers.
//!
//! Both [`SystemBinaryResolver`](super::binary::SystemBinaryResolver) and
//! [`SystemEnvironmentProvider`](super::environment::SystemEnvironmentProvider)
//! discover an expensive value (an absolute path / a captured environment) once
//! per [`AssistantId`] and cache it behind a mutex. This type owns that
//! check-before-lookup, get-or-insert flow so the resolvers don't each
//! re-implement it.
//!
//! The lookup closure's `io::Error` is propagated unchanged: error mapping to a
//! specific [`AdapterError`](super::error::AdapterError) differs per resolver
//! (a missing binary vs. a failed environment capture), so it stays at the call
//! site rather than being baked into the cache.

use std::collections::HashMap;
use std::sync::Mutex;

use super::AssistantId;

/// A `Mutex<HashMap<AssistantId, T>>` with a get-or-insert helper.
pub struct LookupCache<T> {
    entries: Mutex<HashMap<AssistantId, T>>,
}

impl<T> Default for LookupCache<T> {
    fn default() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }
}

impl<T: Clone> LookupCache<T> {
    /// Build an empty cache.
    pub fn new() -> Self {
        Self::default()
    }

    /// Return the cached value for `id`, or compute it with `lookup`, cache it,
    /// and return it. `lookup` runs at most once per distinct `id` (until the
    /// process exits); its error is returned unchanged so the caller maps it.
    pub fn get_or_try_insert_with<F>(&self, id: AssistantId, lookup: F) -> std::io::Result<T>
    where
        F: FnOnce() -> std::io::Result<T>,
    {
        if let Some(value) = self.entries.lock().unwrap().get(&id).cloned() {
            return Ok(value);
        }
        let value = lookup()?;
        self.entries.lock().unwrap().insert(id, value.clone());
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn computes_once_then_serves_from_cache() {
        let calls = AtomicUsize::new(0);
        let cache: LookupCache<String> = LookupCache::new();
        let lookup = || {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok("value".to_string())
        };

        let first = cache.get_or_try_insert_with(AssistantId::Codex, lookup).unwrap();
        let second = cache.get_or_try_insert_with(AssistantId::Codex, lookup).unwrap();

        assert_eq!(first, "value");
        assert_eq!(second, "value");
        assert_eq!(calls.load(Ordering::SeqCst), 1, "lookup must be cached");
    }

    #[test]
    fn caches_per_assistant_id() {
        let calls = AtomicUsize::new(0);
        let cache: LookupCache<AssistantId> = LookupCache::new();

        for _ in 0..2 {
            cache
                .get_or_try_insert_with(AssistantId::Codex, || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok(AssistantId::Codex)
                })
                .unwrap();
            cache
                .get_or_try_insert_with(AssistantId::Claude, || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok(AssistantId::Claude)
                })
                .unwrap();
        }

        assert_eq!(calls.load(Ordering::SeqCst), 2, "one lookup per distinct id");
    }

    #[test]
    fn lookup_error_is_propagated_and_not_cached() {
        let calls = AtomicUsize::new(0);
        let cache: LookupCache<String> = LookupCache::new();

        let err = cache
            .get_or_try_insert_with(AssistantId::Codex, || {
                calls.fetch_add(1, Ordering::SeqCst);
                Err(std::io::Error::new(std::io::ErrorKind::NotFound, "nope"))
            })
            .unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::NotFound);

        // A failed lookup leaves nothing cached, so a later call retries.
        let ok = cache
            .get_or_try_insert_with(AssistantId::Codex, || {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok("recovered".to_string())
            })
            .unwrap();
        assert_eq!(ok, "recovered");
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}
