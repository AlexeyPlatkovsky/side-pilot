//! Shared infrastructure used by every CLI adapter.
//!
//! [`AdapterBase`] holds the three injected dependencies plus the neutral
//! working directory and provides the `resolve_cwd` and `dispatch` operations
//! that all three adapters repeat identically. [`map_runner_io_error`] converts
//! an `io::Error` from the runner into the adapter error taxonomy.

use std::path::PathBuf;
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use super::binary::BinaryResolver;
use super::contract::AdapterRequest;
use super::environment::EnvironmentProvider;
use super::error::AdapterError;
use super::process::{CommandRunner, CommandSpec, RunOutcome};
use super::AssistantId;

/// Dependencies and neutral-cwd shared by every CLI adapter.
pub struct AdapterBase {
    pub resolver: Arc<dyn BinaryResolver>,
    pub runner: Arc<dyn CommandRunner>,
    pub env_provider: Arc<dyn EnvironmentProvider>,
    /// Neutral working directory used when a request carries no workspace (§3).
    pub neutral_cwd: PathBuf,
}

impl AdapterBase {
    pub fn new(
        resolver: Arc<dyn BinaryResolver>,
        runner: Arc<dyn CommandRunner>,
        env_provider: Arc<dyn EnvironmentProvider>,
    ) -> Self {
        Self {
            resolver,
            runner,
            env_provider,
            neutral_cwd: std::env::temp_dir(),
        }
    }

    /// Override the neutral working directory (tests use this for determinism).
    #[cfg(test)]
    pub fn with_neutral_cwd(mut self, cwd: PathBuf) -> Self {
        self.neutral_cwd = cwd;
        self
    }

    /// The working directory for a request: the requested workspace, or the
    /// neutral app-controlled directory when none is supplied (§3, MVP).
    pub fn resolve_cwd(&self, req: &AdapterRequest) -> PathBuf {
        req.working_directory
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| self.neutral_cwd.clone())
    }

    /// Resolve the binary, build the environment, construct the
    /// [`CommandSpec`], and run it. The caller computes `args` and `cwd`
    /// (so per-adapter flag differences stay in each adapter's `build_args`).
    pub async fn dispatch(
        &self,
        id: AssistantId,
        args: Vec<String>,
        cwd: PathBuf,
        req: &AdapterRequest,
        cancel: CancellationToken,
    ) -> Result<RunOutcome, AdapterError> {
        let program = self.resolver.resolve(id).await?;
        let env = self.env_provider.environment(id).await?;
        let spec = CommandSpec {
            program,
            args,
            cwd,
            env,
            stdin: None,
            timeout: req.timeout(),
            cancel,
        };
        self.runner.run(spec).await.map_err(map_runner_io_error)
    }
}

/// Map an `io::Error` from the command runner onto the adapter error taxonomy.
/// `NotFound` means the binary wasn't found on PATH; any other OS error maps
/// to a generic non-zero exit (the runner could not spawn or await the process).
pub fn map_runner_io_error(err: std::io::Error) -> AdapterError {
    if err.kind() == std::io::ErrorKind::NotFound {
        AdapterError::BinaryNotFound
    } else {
        AdapterError::NonZeroExit {
            code: None,
            stderr: err.to_string(),
        }
    }
}
