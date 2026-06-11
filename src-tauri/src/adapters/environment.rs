//! CLI environment resolution.
//!
//! GUI-launched desktop apps do not reliably inherit the user's interactive
//! shell environment. Adapters receive environment entries from this seam so
//! CLIs can still find their config and credentials when launched from Finder
//! or Explorer-like contexts.

use async_trait::async_trait;

use super::cache::LookupCache;
use super::error::AdapterError;
use super::AssistantId;

type Lookup = Box<dyn Fn(AssistantId) -> std::io::Result<Vec<(String, String)>> + Send + Sync>;

#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait EnvironmentProvider: Send + Sync {
    async fn environment(&self, id: AssistantId) -> Result<Vec<(String, String)>, AdapterError>;
}

pub struct SystemEnvironmentProvider {
    cache: LookupCache<Vec<(String, String)>>,
    lookup: Lookup,
}

impl Default for SystemEnvironmentProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemEnvironmentProvider {
    pub fn new() -> Self {
        Self {
            cache: LookupCache::new(),
            lookup: Box::new(os_environment),
        }
    }

    #[cfg(test)]
    fn with_lookup(lookup: Lookup) -> Self {
        Self {
            cache: LookupCache::new(),
            lookup,
        }
    }
}

#[async_trait]
impl EnvironmentProvider for SystemEnvironmentProvider {
    async fn environment(&self, id: AssistantId) -> Result<Vec<(String, String)>, AdapterError> {
        self.cache
            .get_or_try_insert_with(id.clone(), || (self.lookup)(id))
            .map_err(|err| AdapterError::NonZeroExit {
                code: None,
                stderr: format!("failed to resolve CLI environment: {err}"),
            })
    }
}

#[cfg(not(windows))]
fn os_environment(_id: AssistantId) -> std::io::Result<Vec<(String, String)>> {
    let output = std::process::Command::new("/bin/zsh")
        .args(["-lc", "env"])
        .output()?;

    if !output.status.success() {
        return Err(std::io::Error::other(
            "login shell failed while resolving environment",
        ));
    }

    Ok(parse_env_output(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg(windows)]
fn os_environment(_id: AssistantId) -> std::io::Result<Vec<(String, String)>> {
    Ok(std::env::vars().collect())
}

fn parse_env_output(stdout: &str) -> Vec<(String, String)> {
    stdout
        .lines()
        .filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            if key.is_empty() {
                return None;
            }
            Some((key.to_string(), value.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn parses_env_output() {
        let env = parse_env_output("HOME=/Users/a\nBAD\nXDG_CONFIG_HOME=/tmp/cfg\n");
        assert_eq!(
            env,
            vec![
                ("HOME".to_string(), "/Users/a".to_string()),
                ("XDG_CONFIG_HOME".to_string(), "/tmp/cfg".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn caches_environment_after_first_lookup() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_for_lookup = Arc::clone(&calls);
        let provider = SystemEnvironmentProvider::with_lookup(Box::new(move |_id| {
            calls_for_lookup.fetch_add(1, Ordering::SeqCst);
            Ok(vec![("HOME".to_string(), "/Users/a".to_string())])
        }));

        let first = provider.environment(AssistantId::Codex).await.unwrap();
        let second = provider.environment(AssistantId::Codex).await.unwrap();

        assert_eq!(first, second);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}
