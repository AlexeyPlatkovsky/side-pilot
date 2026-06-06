//! Lenient JSON parsing shared by CLI adapters whose structured-output mode
//! emits a single JSON document (Claude `--output-format json`, Gemini
//! `-o json`).
//!
//! The CLI Invocation Contract (`docs/idea.md` §5) mandates defensive ANSI
//! stripping before parsing. We parse the raw document first and only strip
//! escapes on failure, so a payload that legitimately contains escape-like
//! bytes is preserved.

use serde_json::Value;

use super::ansi::strip_ansi;
use super::error::AdapterError;

/// Parse `stdout` as a single JSON document, tolerating ANSI wrapping.
///
/// Valid JSON is parsed as-is; only when that fails do we strip ANSI escapes
/// and retry. Empty/whitespace-only output and non-JSON output both map to
/// [`AdapterError::OutputParseFailure`].
pub(crate) fn parse_json_lenient(stdout: &str) -> Result<Value, AdapterError> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err(AdapterError::OutputParseFailure {
            detail: "CLI produced no output".to_string(),
        });
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Ok(value);
    }
    let stripped = strip_ansi(trimmed);
    serde_json::from_str::<Value>(stripped.trim()).map_err(|e| AdapterError::OutputParseFailure {
        detail: format!("CLI output was not valid JSON: {e}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_json_object() {
        let value = parse_json_lenient(r#"{"a":1}"#).unwrap();
        assert_eq!(value["a"], 1);
    }

    #[test]
    fn strips_ansi_only_when_raw_parse_fails() {
        let value = parse_json_lenient("\u{1b}[2m{\"a\":1}\u{1b}[0m").unwrap();
        assert_eq!(value["a"], 1);
    }

    #[test]
    fn empty_output_is_parse_failure() {
        let err = parse_json_lenient("   ").unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }

    #[test]
    fn non_json_output_is_parse_failure() {
        let err = parse_json_lenient("not json").unwrap_err();
        assert!(matches!(err, AdapterError::OutputParseFailure { .. }));
    }
}
