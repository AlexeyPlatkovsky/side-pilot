//! Subprocess execution seam.
//!
//! Adapters never spawn a CLI directly; they describe a [`CommandSpec`] and hand
//! it to a [`CommandRunner`]. This keeps the subprocess effect behind a trait so
//! adapter unit tests mock it (`mockall`) and never launch a real CLI
//! (testing-pro: `references/rust.md`). [`SystemCommandRunner`] is the real
//! implementation used in production.

use std::path::PathBuf;
use std::time::Duration;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

/// A fully-resolved description of one subprocess invocation.
#[derive(Debug, Clone)]
pub struct CommandSpec {
    /// Absolute path to the executable (resolved by a `BinaryResolver`, §2).
    pub program: PathBuf,
    /// Command-line arguments, already constructed by the adapter.
    pub args: Vec<String>,
    /// Working directory for the spawned process (§3).
    pub cwd: PathBuf,
    /// Extra environment entries to inject on top of the inherited environment.
    pub env: Vec<(String, String)>,
    /// Optional text to write to the child's stdin; `None` closes stdin (null).
    pub stdin: Option<String>,
    /// Per-run timeout; on elapse the process is terminated and the run reports
    /// [`RunOutcome::TimedOut`] (§7).
    pub timeout: Duration,
    /// Cancellation hook; when triggered the process is terminated and the run
    /// reports [`RunOutcome::Cancelled`] (§7).
    pub cancel: CancellationToken,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sleeping_command(cancel: CancellationToken, timeout: Duration) -> CommandSpec {
        #[cfg(unix)]
        {
            CommandSpec {
                program: PathBuf::from("/bin/sh"),
                args: vec!["-c".to_string(), "sleep 10".to_string()],
                cwd: std::env::temp_dir(),
                env: Vec::new(),
                stdin: None,
                timeout,
                cancel,
            }
        }

        #[cfg(windows)]
        {
            CommandSpec {
                program: PathBuf::from("cmd"),
                args: vec!["/C".to_string(), "timeout /T 10 /NOBREAK >NUL".to_string()],
                cwd: std::env::temp_dir(),
                env: Vec::new(),
                stdin: None,
                timeout,
                cancel,
            }
        }
    }

    #[tokio::test]
    async fn system_runner_returns_timed_out_for_elapsed_timeout() {
        let outcome = SystemCommandRunner
            .run(sleeping_command(
                CancellationToken::new(),
                Duration::from_millis(10),
            ))
            .await
            .unwrap();

        assert_eq!(outcome, RunOutcome::TimedOut);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn system_runner_timeout_kills_descendant_process_group() {
        let pid_file = std::env::temp_dir().join(format!(
            "side-pilot-process-group-{}-{}.pid",
            std::process::id(),
            unique_test_id()
        ));
        let pid_path = pid_file.to_string_lossy().to_string();

        let outcome = SystemCommandRunner
            .run(CommandSpec {
                program: PathBuf::from("/bin/sh"),
                args: vec![
                    "-c".to_string(),
                    "sleep 10 & echo $! > \"$1\"; wait".to_string(),
                    "side-pilot-test".to_string(),
                    pid_path,
                ],
                cwd: std::env::temp_dir(),
                env: Vec::new(),
                stdin: None,
                timeout: Duration::from_millis(100),
                cancel: CancellationToken::new(),
            })
            .await
            .unwrap();

        assert_eq!(outcome, RunOutcome::TimedOut);

        let child_pid = read_pid_file(&pid_file).await;
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(
            !process_exists(child_pid),
            "descendant process {child_pid} survived process-group termination"
        );

        let _ = std::fs::remove_file(pid_file);
    }

    #[tokio::test]
    async fn system_runner_returns_cancelled_when_token_is_cancelled() {
        let cancel = CancellationToken::new();
        cancel.cancel();

        let outcome = SystemCommandRunner
            .run(sleeping_command(cancel, Duration::from_secs(10)))
            .await
            .unwrap();

        assert_eq!(outcome, RunOutcome::Cancelled);
    }

    #[cfg(unix)]
    fn unique_test_id() -> u64 {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(1);
        NEXT.fetch_add(1, Ordering::Relaxed)
    }

    #[cfg(unix)]
    async fn read_pid_file(path: &std::path::Path) -> libc::pid_t {
        for _ in 0..20 {
            if let Ok(raw) = std::fs::read_to_string(path) {
                if let Ok(pid) = raw.trim().parse::<libc::pid_t>() {
                    return pid;
                }
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        panic!("child pid file was not written: {}", path.display());
    }

    #[cfg(unix)]
    fn process_exists(pid: libc::pid_t) -> bool {
        unsafe { libc::kill(pid, 0) == 0 }
    }
}

/// How a subprocess run finished.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunOutcome {
    /// The process exited on its own.
    Completed {
        /// Process exit code, or `None` if terminated by a signal.
        exit_code: Option<i32>,
        /// Captured stdout (UTF-8 lossy).
        stdout: String,
        /// Captured stderr (UTF-8 lossy).
        stderr: String,
    },
    /// The timeout elapsed before the process exited; it was terminated.
    TimedOut,
    /// Cancellation was requested before the process exited; it was terminated.
    Cancelled,
}

/// Runs a [`CommandSpec`] to completion (or timeout/cancellation).
///
/// An `Err` is reserved for the process failing to *start* or be waited on
/// (e.g. the resolved binary vanished or the cwd is invalid); adapters map
/// the concrete I/O error onto their public error taxonomy.
#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait CommandRunner: Send + Sync {
    async fn run(&self, spec: CommandSpec) -> std::io::Result<RunOutcome>;
}

/// Production [`CommandRunner`] backed by `tokio::process::Command`.
///
/// Timeout/cancellation terminate the process group first, then rely on
/// `kill_on_drop(true)` as a direct-child fallback.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemCommandRunner;

#[async_trait]
impl CommandRunner for SystemCommandRunner {
    async fn run(&self, spec: CommandSpec) -> std::io::Result<RunOutcome> {
        use std::process::Stdio;
        use tokio::io::AsyncWriteExt;

        let mut cmd = tokio::process::Command::new(&spec.program);
        cmd.args(&spec.args)
            .current_dir(&spec.cwd)
            .stdin(if spec.stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        configure_process_group(&mut cmd);

        for (key, value) in &spec.env {
            cmd.env(key, value);
        }

        let mut child = cmd.spawn()?;
        let child_id = child.id();

        if let Some(input) = &spec.stdin {
            if let Some(mut stdin) = child.stdin.take() {
                stdin.write_all(input.as_bytes()).await?;
                stdin.shutdown().await?;
            }
        }

        // `wait_with_output` consumes `child`; moving it into this future means
        // dropping the future (on cancel/timeout) drops the child and, with
        // `kill_on_drop`, terminates the process.
        let run = async move { child.wait_with_output().await };
        tokio::pin!(run);
        let timeout = tokio::time::sleep(spec.timeout);
        tokio::pin!(timeout);

        tokio::select! {
            biased;
            _ = spec.cancel.cancelled() => {
                terminate_process_group(child_id).await;
                Ok(RunOutcome::Cancelled)
            }
            _ = &mut timeout => {
                terminate_process_group(child_id).await;
                Ok(RunOutcome::TimedOut)
            }
            output = &mut run => {
                let output = output?;
                Ok(RunOutcome::Completed {
                    exit_code: output.status.code(),
                    stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                    stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
                })
            },
        }
    }
}

#[cfg(unix)]
fn configure_process_group(cmd: &mut tokio::process::Command) {
    cmd.process_group(0);
}

#[cfg(windows)]
fn configure_process_group(cmd: &mut tokio::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
}

#[cfg(unix)]
async fn terminate_process_group(child_id: Option<u32>) {
    let Some(pid) = child_id else {
        return;
    };
    let pgid = -(pid as libc::pid_t);
    unsafe {
        libc::kill(pgid, libc::SIGTERM);
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
    unsafe {
        libc::kill(pgid, libc::SIGKILL);
    }
}

#[cfg(windows)]
async fn terminate_process_group(child_id: Option<u32>) {
    let Some(pid) = child_id else {
        return;
    };
    let _ = tokio::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await;
}
