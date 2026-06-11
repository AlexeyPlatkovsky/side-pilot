//! CLI binary resolution (CLI Invocation Contract §2).
//!
//! A GUI app does not inherit the user's interactive shell `PATH`, so adapters
//! must not rely on bare `PATH` lookup of `codex`/`claude`/`gemini`. A
//! [`BinaryResolver`] turns an [`AssistantId`] into an **absolute path**,
//! discovered once and cached. The seam is a trait so adapter tests mock it.

use std::path::PathBuf;

use async_trait::async_trait;

use super::cache::LookupCache;
use super::error::AdapterError;
use super::AssistantId;

/// Resolves an assistant's CLI to an absolute executable path.
#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait BinaryResolver: Send + Sync {
    async fn resolve(&self, id: AssistantId) -> Result<PathBuf, AdapterError>;
}

/// The low-level lookup that discovers an absolute path for an assistant, used
/// by [`SystemBinaryResolver`]. Returns `io::ErrorKind::NotFound` when the
/// executable cannot be located.
type Lookup = Box<dyn Fn(AssistantId) -> std::io::Result<PathBuf> + Send + Sync>;

/// Production [`BinaryResolver`]: resolves via a login shell on macOS (so the
/// tool's real `PATH` is consulted) or `where` on Windows, and caches the
/// result per assistant.
pub struct SystemBinaryResolver {
    cache: LookupCache<PathBuf>,
    lookup: Lookup,
}

impl Default for SystemBinaryResolver {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemBinaryResolver {
    /// Build a resolver backed by the real OS lookup.
    pub fn new() -> Self {
        Self {
            cache: LookupCache::new(),
            lookup: Box::new(os_lookup),
        }
    }

    /// Build a resolver with an injected lookup (tests only) so caching can be
    /// verified without spawning a real shell.
    #[cfg(test)]
    fn with_lookup(lookup: Lookup) -> Self {
        Self {
            cache: LookupCache::new(),
            lookup,
        }
    }
}

#[async_trait]
impl BinaryResolver for SystemBinaryResolver {
    async fn resolve(&self, id: AssistantId) -> Result<PathBuf, AdapterError> {
        self.cache
            .get_or_try_insert_with(id.clone(), || (self.lookup)(id))
            .map_err(|_| AdapterError::BinaryNotFound)
    }
}

/// Real OS lookup: a login shell on Unix, `where` on Windows.
fn os_lookup(id: AssistantId) -> std::io::Result<PathBuf> {
    let bin = id.as_str();

    #[cfg(windows)]
    let output = std::process::Command::new("where").arg(bin.as_ref()).output()?;

    #[cfg(not(windows))]
    let output = std::process::Command::new("/bin/zsh")
        .args(["-lc", &format!("command -v {bin}")])
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // `where` may return multiple lines; take the first non-empty path.
    let path = stdout.lines().map(str::trim).find(|line| !line.is_empty());
    match path {
        Some(path) if output.status.success() => Ok(PathBuf::from(path)),
        _ => Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("could not resolve binary for {bin}"),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn caches_lookup_after_first_resolve() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_for_lookup = Arc::clone(&calls);
        let resolver = SystemBinaryResolver::with_lookup(Box::new(move |_id| {
            calls_for_lookup.fetch_add(1, Ordering::SeqCst);
            Ok(PathBuf::from("/usr/local/bin/codex"))
        }));

        let first = resolver.resolve(AssistantId::Codex).await.unwrap();
        let second = resolver.resolve(AssistantId::Codex).await.unwrap();

        assert_eq!(first, PathBuf::from("/usr/local/bin/codex"));
        assert_eq!(second, first);
        assert_eq!(calls.load(Ordering::SeqCst), 1, "lookup must be cached");
    }

    #[tokio::test]
    async fn maps_missing_binary_to_binary_not_found() {
        let resolver = SystemBinaryResolver::with_lookup(Box::new(|_id| {
            Err(std::io::Error::new(std::io::ErrorKind::NotFound, "nope"))
        }));

        let err = resolver.resolve(AssistantId::Codex).await.unwrap_err();
        assert_eq!(err, AdapterError::BinaryNotFound);
    }
}
