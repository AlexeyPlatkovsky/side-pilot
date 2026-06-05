/**
 * Pure chat-history helpers (SP-049).
 *
 * Title generation, relative-time formatting, list ordering, and post-delete
 * selection are kept as plain functions so the rail's data behavior is unit-
 * tested without React or a live Tauri backend. The components in
 * `components/ChatHistory.tsx` consume these.
 */

import type { PersistedSession } from "./api";

/** Longest chat title we persist, in characters (after trimming). */
export const MAX_TITLE_LENGTH = 40;
/** Don't break a trimmed title before this many characters (keeps it readable). */
const MIN_TITLE_BREAK = 80;

// A chat title may contain Unicode letters, digits, spaces, and basic word
// punctuation (hyphen, straight/curly apostrophe, period, comma, parentheses).
// Everything else — `@ # $ % ^ & * / = < > !`, emoji, control chars — is a
// "special symbol" and is rejected on rename and stripped from generated titles.
const ALLOWED_TITLE = /^[\p{L}\p{N} '’.,()-]+$/u;
const DISALLOWED_TITLE_CHARS = /[^\p{L}\p{N} '’.,()-]+/gu;
/** A valid title must carry at least one letter or digit (not punctuation-only). */
const HAS_ALNUM = /[\p{L}\p{N}]/u;

/**
 * Whether `raw` is an acceptable chat title: 1–{@link MAX_TITLE_LENGTH}
 * characters after trimming, containing at least one letter or digit, and using
 * only the allowed character set (no special symbols). Used to gate the rename
 * dialog's Save control.
 */
export function isValidTitle(raw: string): boolean {
  const title = raw.trim();
  return (
    title.length >= 1 &&
    title.length <= MAX_TITLE_LENGTH &&
    HAS_ALNUM.test(title) &&
    ALLOWED_TITLE.test(title)
  );
}

/**
 * Build a default chat title from the first user prompt: strip disallowed
 * symbols, collapse whitespace, and use it as-is when short, otherwise trim to a
 * readable length on a word boundary. The result is always either `""` (blank or
 * symbol-only prompt — the caller skips persisting it) or a value that satisfies
 * {@link isValidTitle}, so generated and user-entered titles obey the same rule.
 */
export function generateTitle(prompt: string): string {
  // Replace disallowed runs with a space so adjacent words don't fuse, then
  // collapse the whitespace that leaves behind.
  const cleaned = prompt.replace(DISALLOWED_TITLE_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!HAS_ALNUM.test(cleaned)) return "";
  if (cleaned.length <= MAX_TITLE_LENGTH) return cleaned;

  const slice = cleaned.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = slice.lastIndexOf(" ");
  // Break on the last word boundary, but only if that doesn't cut the title too
  // short; otherwise hard-cut at MAX_TITLE_LENGTH. No ellipsis suffix: the cap
  // is the hard limit so the result stays within isValidTitle's length bound.
  const cut = (
    lastSpace >= MIN_TITLE_BREAK ? slice.slice(0, lastSpace) : slice
  ).trimEnd();
  // Degenerate input (e.g. 40+ leading punctuation chars before the first
  // letter) can leave a punctuation-only prefix; treat that as untitled rather
  // than persist a value that would fail isValidTitle.
  return HAS_ALNUM.test(cut) ? cut : "";
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact relative time for the row's right column: the largest sensible whole
 * unit (`now`, `m`, `h`, `d`, `w`, `M`, `y`). A future timestamp clamps to
 * `now`. Units use calendar-ish divisors (week = 7d, month = 30d, year = 365d).
 */
export function formatRelativeTime(updatedAt: number, now: number): string {
  const diff = Math.max(0, now - updatedAt);
  const sec = Math.floor(diff / SECOND);
  if (sec < 60) return "now";
  const min = Math.floor(diff / MINUTE);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(diff / HOUR);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(diff / DAY);
  if (day < 7) return `${day}d`;
  if (day < 30) return `${Math.floor(day / 7)}w`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}M`;
  // At day 360-364 the year divisor still rounds to 0; clamp so the unit never
  // regresses below 1y once we pass twelve months.
  return `${Math.max(1, Math.floor(day / 365))}y`;
}

/**
 * Format a message's creation time for the transcript: 24h clock (`HH:MM`)
 * always, prefixed with a short local date (e.g. `Jun 4, 14:32`) when the
 * message is not from the same calendar day as `now`. The hour is always 24h
 * regardless of locale; only the date prefix is locale-formatted.
 */
export function formatMessageTimestamp(createdAt: number, now: number): string {
  const d = new Date(createdAt);
  const today = new Date(now);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return time;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

/**
 * Order sessions for the rail: most recently updated first, tie-broken on id
 * ascending to match the Rust `list_sessions` ordering and stay deterministic.
 * Returns a new array; the input is not mutated.
 */
export function sortSessions(sessions: PersistedSession[]): PersistedSession[] {
  return [...sessions].sort(
    (a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * After deleting `deletedId`, choose the next active session: the most recently
 * updated session that remains, or `null` if none are left (the caller then
 * creates a fresh empty chat).
 */
export function pickNextActiveSession(
  sessions: PersistedSession[],
  deletedId: string,
): string | null {
  const remaining = sortSessions(sessions.filter((s) => s.id !== deletedId));
  return remaining[0]?.id ?? null;
}
