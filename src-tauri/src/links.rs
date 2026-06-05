//! External-link handling.
//!
//! Assistant Markdown can contain links. side-pilot is a floating panel, so a
//! link must open in the user's default browser — never navigate the app's own
//! WebView (the app should only ever show itself). This module gates which URLs
//! are allowed through to the OS opener: only `http`, `https`, and `mailto`.
//! Everything else (`javascript:`, `file:`, `data:`, protocol-relative, or
//! scheme-less) is rejected so a malicious link can't run script, reach the
//! local filesystem, or otherwise escape the panel.

use serde::{Deserialize, Serialize};

/// Failure modes for opening an external link. Serialized internally-tagged
/// (`{"kind": "..."}`, camelCase) to match the storage/adapter error convention.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OpenError {
    /// The URL's scheme is not an allowed external scheme.
    Rejected { url: String },
    /// The OS opener failed to launch the URL.
    Failed { detail: String },
}

impl std::fmt::Display for OpenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OpenError::Rejected { url } => write!(f, "refused to open unsafe url: {url}"),
            OpenError::Failed { detail } => write!(f, "failed to open url: {detail}"),
        }
    }
}

impl std::error::Error for OpenError {}

/// Whether `raw` is a safe external link to hand to the system opener. Only
/// `http://`, `https://`, and `mailto:` (with a non-empty target) are allowed;
/// scheme matching is case-insensitive and surrounding whitespace is ignored.
pub fn is_safe_external_url(raw: &str) -> bool {
    let trimmed = raw.trim();
    let Some(colon) = trimmed.find(':') else {
        return false; // scheme-less or protocol-relative — not openable safely
    };
    let scheme = trimmed[..colon].to_ascii_lowercase();
    let rest = &trimmed[colon + 1..];
    match scheme.as_str() {
        // Require "//" plus a non-whitespace authority (reject "http://" and
        // "https://   " — an empty/blank host has nothing to open).
        "http" | "https" => rest
            .strip_prefix("//")
            .is_some_and(|authority| !authority.trim().is_empty()),
        // Require a non-empty address after "mailto:".
        "mailto" => !rest.trim().is_empty(),
        _ => false,
    }
}

/// Open a validated external URL in the system default application. Rejects
/// unsafe schemes before touching the OS opener, so this is the single trusted
/// entry point for assistant-provided links.
pub fn open_external(url: &str) -> Result<(), OpenError> {
    if !is_safe_external_url(url) {
        return Err(OpenError::Rejected {
            url: url.to_string(),
        });
    }
    open::that(url).map_err(|err| OpenError::Failed {
        detail: err.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_http_and_https_with_a_host() {
        assert!(is_safe_external_url("http://example.com"));
        assert!(is_safe_external_url("https://example.com/path?q=1#frag"));
        assert!(is_safe_external_url("https://example.com:8443/a"));
    }

    #[test]
    fn accepts_mailto_with_an_address() {
        assert!(is_safe_external_url("mailto:user@example.com"));
    }

    #[test]
    fn scheme_match_is_case_insensitive_and_trims_whitespace() {
        assert!(is_safe_external_url("HTTPS://example.com"));
        assert!(is_safe_external_url("  https://example.com  "));
    }

    #[test]
    fn rejects_dangerous_and_local_schemes() {
        assert!(!is_safe_external_url("javascript:alert(1)"));
        assert!(!is_safe_external_url("file:///etc/passwd"));
        assert!(!is_safe_external_url("data:text/html,<script>1</script>"));
        assert!(!is_safe_external_url("vbscript:msgbox(1)"));
    }

    #[test]
    fn rejects_malformed_or_schemeless_urls() {
        assert!(!is_safe_external_url(""));
        assert!(!is_safe_external_url("   "));
        assert!(!is_safe_external_url("example.com")); // no scheme
        assert!(!is_safe_external_url("//example.com")); // protocol-relative
        assert!(!is_safe_external_url("http:/example.com")); // missing a slash
        assert!(!is_safe_external_url("http://")); // no host
        assert!(!is_safe_external_url("https://   ")); // blank authority
        assert!(!is_safe_external_url("mailto:")); // no address
        assert!(!is_safe_external_url("mailto:   ")); // blank address
    }

    #[test]
    fn open_external_rejects_unsafe_urls_without_opening() {
        let err = open_external("file:///etc/passwd").unwrap_err();
        assert_eq!(
            err,
            OpenError::Rejected {
                url: "file:///etc/passwd".to_string()
            }
        );
    }
}
