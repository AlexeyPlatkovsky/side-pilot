//! Adapter request/result contract.
//!
//! These are the typed values that cross the Tauri IPC boundary: the React
//! front-end sends an [`AdapterRequest`] to the `run_adapter` command and
//! receives an [`AdapterResult`] (or an [`AdapterError`](super::error::AdapterError)).
//! Field names serialize as camelCase to match the TypeScript side.
//!
//! The shape deliberately models blocking-vs-streaming, model selection, and
//! permission posture as *properties of the request* so the MVP can ship
//! blocking + read-only and evolve without reshaping the contract
//! (`docs/idea.md` §9).

use std::time::Duration;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Default per-adapter timeout when the request omits one (CLI Invocation
/// Contract §7, proposed default 120s).
pub const DEFAULT_TIMEOUT_MS: u64 = 120_000;

/// Permission / safety posture for a run (CLI Invocation Contract §4).
///
/// The MVP ships only [`PermissionMode::ReadOnly`]; write/execute modes are
/// opt-in per session and out of MVP scope, but the enum is kept open so the
/// request shape does not change when they arrive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub enum PermissionMode {
    /// Read-only sandbox — the MVP default and the only supported mode.
    #[default]
    ReadOnly,
}

/// A single adapter invocation requested by the front-end.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct AdapterRequest {
    /// Which assistant CLI to route to.
    pub assistant: super::AssistantId,
    /// The user's prompt text.
    pub prompt: String,
    /// Optional working directory the CLI should treat as its root. `None`
    /// means the adapter picks a neutral app-controlled directory (§3, MVP).
    #[serde(default)]
    #[ts(optional)]
    pub working_directory: Option<String>,
    /// Optional model id override (`-m/--model`).
    #[serde(default)]
    #[ts(optional)]
    pub model: Option<String>,
    /// Optional reasoning-effort override (`-c model_reasoning_effort=...`),
    /// e.g. "low" | "medium" | "high". Applied on fresh runs only; a resumed
    /// session inherits the effort of its originating session (§6).
    #[serde(default)]
    #[ts(optional)]
    pub reasoning_effort: Option<String>,
    /// Permission posture for this run.
    #[serde(default)]
    pub permission_mode: PermissionMode,
    /// Timeout in milliseconds; falls back to [`DEFAULT_TIMEOUT_MS`].
    #[serde(default = "default_timeout_ms")]
    // Serialized as a JSON number over IPC; ts-rs would otherwise emit `bigint`.
    #[ts(type = "number")]
    pub timeout_ms: u64,
    /// Native session id to resume for conversation continuity (§6). `None`
    /// starts a fresh session.
    #[serde(default)]
    #[ts(optional)]
    pub resume_session_id: Option<String>,
    /// Front-end-generated run id used by `cancel_adapter_run` to cancel the
    /// in-flight subprocess. If omitted, the backend generates an internal id.
    #[serde(default)]
    #[ts(optional)]
    pub run_id: Option<String>,
}

fn default_timeout_ms() -> u64 {
    DEFAULT_TIMEOUT_MS
}

impl AdapterRequest {
    /// The configured timeout as a [`Duration`].
    pub fn timeout(&self) -> Duration {
        Duration::from_millis(self.timeout_ms)
    }
}

/// Token accounting reported by the CLI for a single turn.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct Usage {
    #[ts(type = "number")]
    pub input_tokens: u64,
    #[ts(type = "number")]
    pub cached_input_tokens: u64,
    #[ts(type = "number")]
    pub output_tokens: u64,
    #[ts(type = "number")]
    pub reasoning_output_tokens: u64,
}

/// The typed result of a successful adapter run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct AdapterResult {
    /// Final assistant text, rendered as Markdown in the chat (§5).
    pub assistant_text: String,
    /// The raw structured output from the CLI, retained for inspection/debug.
    pub raw_json: String,
    /// Native session id captured from the CLI, to be persisted and reused for
    /// resume (§6). `None` when the CLI did not report one.
    // Output field: serde serializes `None` as `null`, so the TS type is
    // `string | null` (not an omittable `?:`), matching the wire shape.
    #[serde(default)]
    pub native_session_id: Option<String>,
    /// Token usage when the CLI reported it.
    #[serde(default)]
    pub usage: Option<Usage>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::AssistantId;

    #[test]
    fn request_deserializes_camel_case_with_defaults() {
        // Front-end may send only the required fields.
        let json = serde_json::json!({
            "assistant": "codex",
            "prompt": "hello",
        });
        let req: AdapterRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.assistant, AssistantId::Codex);
        assert_eq!(req.prompt, "hello");
        assert_eq!(req.working_directory, None);
        assert_eq!(req.model, None);
        assert_eq!(req.permission_mode, PermissionMode::ReadOnly);
        assert_eq!(req.timeout_ms, DEFAULT_TIMEOUT_MS);
        assert_eq!(req.resume_session_id, None);
        assert_eq!(req.run_id, None);
        assert_eq!(req.reasoning_effort, None);
    }

    #[test]
    fn request_reads_all_camel_case_fields() {
        let json = serde_json::json!({
            "assistant": "codex",
            "prompt": "hi",
            "workingDirectory": "/tmp/work",
            "model": "gpt-5",
            "permissionMode": "readOnly",
            "timeoutMs": 5000,
            "resumeSessionId": "abc-123",
            "runId": "run-1",
            "reasoningEffort": "medium",
        });
        let req: AdapterRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.working_directory.as_deref(), Some("/tmp/work"));
        assert_eq!(req.model.as_deref(), Some("gpt-5"));
        assert_eq!(req.reasoning_effort.as_deref(), Some("medium"));
        assert_eq!(req.timeout(), Duration::from_millis(5000));
        assert_eq!(req.resume_session_id.as_deref(), Some("abc-123"));
        assert_eq!(req.run_id.as_deref(), Some("run-1"));
    }

    #[test]
    fn result_serializes_camel_case() {
        let result = AdapterResult {
            assistant_text: "pong".to_string(),
            raw_json: "{}".to_string(),
            native_session_id: Some("sid".to_string()),
            usage: Some(Usage {
                input_tokens: 10,
                ..Usage::default()
            }),
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["assistantText"], "pong");
        assert_eq!(json["nativeSessionId"], "sid");
        assert_eq!(json["usage"]["inputTokens"], 10);
        assert_eq!(json["usage"]["cachedInputTokens"], 0);
    }

    #[test]
    fn request_round_trips_through_json() {
        let original = AdapterRequest {
            assistant: AssistantId::Codex,
            prompt: "hello world".to_string(),
            working_directory: Some("/tmp/project".to_string()),
            model: Some("gpt-5.5".to_string()),
            reasoning_effort: Some("high".to_string()),
            permission_mode: PermissionMode::ReadOnly,
            timeout_ms: 90_000,
            resume_session_id: Some("sid-42".to_string()),
            run_id: Some("run-99".to_string()),
        };
        let json = serde_json::to_value(&original).unwrap();
        let round_tripped: AdapterRequest = serde_json::from_value(json).unwrap();
        assert_eq!(round_tripped.assistant, original.assistant);
        assert_eq!(round_tripped.prompt, original.prompt);
        assert_eq!(round_tripped.working_directory, original.working_directory);
        assert_eq!(round_tripped.model, original.model);
        assert_eq!(round_tripped.reasoning_effort, original.reasoning_effort);
        assert_eq!(round_tripped.timeout_ms, original.timeout_ms);
        assert_eq!(round_tripped.resume_session_id, original.resume_session_id);
        assert_eq!(round_tripped.run_id, original.run_id);
    }

    #[test]
    fn result_round_trips_through_json() {
        let original = AdapterResult {
            assistant_text: "**response**".to_string(),
            raw_json: r#"{"key":"value"}"#.to_string(),
            native_session_id: Some("resume-me".to_string()),
            usage: Some(Usage {
                input_tokens: 50,
                cached_input_tokens: 10,
                output_tokens: 120,
                reasoning_output_tokens: 0,
            }),
        };
        let json = serde_json::to_value(&original).unwrap();
        let round_tripped: AdapterResult = serde_json::from_value(json).unwrap();
        assert_eq!(round_tripped.assistant_text, original.assistant_text);
        assert_eq!(round_tripped.raw_json, original.raw_json);
        assert_eq!(round_tripped.native_session_id, original.native_session_id);
        let u = round_tripped.usage.unwrap();
        assert_eq!(u.input_tokens, 50);
        assert_eq!(u.cached_input_tokens, 10);
        assert_eq!(u.output_tokens, 120);
        assert_eq!(u.reasoning_output_tokens, 0);
    }
}
