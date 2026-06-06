//! Defensive ANSI escape stripping shared by CLI adapters.
//!
//! The CLI Invocation Contract (`docs/idea.md` §5) mandates stripping ANSI
//! escape sequences defensively before parsing structured output: although each
//! tool's machine-readable mode emits plain JSON/JSONL, a terminal wrapper may
//! interleave escapes around the lines. Both the Codex and Claude adapters share
//! this stripper so a wrapped line still parses as JSON.

const ESC: char = '\u{1b}';
const BEL: char = '\u{07}';

/// Strip ANSI escape sequences from `input` (CLI Invocation Contract §5).
///
/// Handles the escape classes that show up in practice so a wrapped line still
/// parses as JSON:
/// - CSI (`ESC [ … final`) — colors, cursor moves.
/// - OSC (`ESC ] … BEL|ST`) — window-title / hyperlink sequences, terminated
///   by BEL (`0x07`) or ST (`ESC \`). A CSI-only stripper mis-handles these
///   because `]` itself falls in the CSI final-byte range.
/// - String sequences DCS/SOS/PM/APC (`ESC P|X|^|_ … ST`).
/// - nF / two-byte escapes (`ESC (intermediates) final`, e.g. `ESC c`).
pub(crate) fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c != ESC {
            out.push(c);
            continue;
        }
        match chars.next() {
            // Dangling ESC at end of input — nothing to strip.
            None => break,
            // CSI: parameter/intermediate bytes then a final byte 0x40..=0x7E.
            Some('[') => {
                for seq in chars.by_ref() {
                    if ('\u{40}'..='\u{7e}').contains(&seq) {
                        break;
                    }
                }
            }
            // String sequences: OSC / DCS / SOS / PM / APC, terminated by BEL
            // or ST (ESC \).
            Some(']') | Some('P') | Some('X') | Some('^') | Some('_') => {
                while let Some(seq) = chars.next() {
                    if seq == BEL {
                        break;
                    }
                    if seq == ESC {
                        if chars.peek() == Some(&'\\') {
                            chars.next();
                        }
                        break;
                    }
                }
            }
            // nF escape: intermediate bytes 0x20..=0x2F then a final byte.
            Some(c) if ('\u{20}'..='\u{2f}').contains(&c) => {
                for seq in chars.by_ref() {
                    if !('\u{20}'..='\u{2f}').contains(&seq) {
                        break;
                    }
                }
            }
            // Two-byte escape (e.g. `ESC c` reset): the escape is complete.
            Some(_) => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_ansi_removes_csi_color_sequences() {
        assert_eq!(strip_ansi("\u{1b}[2mhello\u{1b}[0m"), "hello");
    }

    #[test]
    fn strip_ansi_removes_osc_sequences_terminated_by_bel() {
        // OSC: ESC ] 0 ; <title> BEL  — terminated by BEL, not a CSI final byte.
        assert_eq!(strip_ansi("\u{1b}]0;window title\u{07}body"), "body");
    }

    #[test]
    fn strip_ansi_removes_osc_sequences_terminated_by_st() {
        // OSC terminated by ST (ESC \).
        assert_eq!(strip_ansi("\u{1b}]8;;https://x\u{1b}\\link"), "link");
    }

    #[test]
    fn strip_ansi_removes_two_byte_and_charset_escapes() {
        // ESC c (full reset) and ESC ( B (designate G0 charset) are non-CSI.
        assert_eq!(strip_ansi("\u{1b}cplain"), "plain");
        assert_eq!(strip_ansi("\u{1b}(Bplain"), "plain");
    }
}
