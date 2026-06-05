import { describe, it, expect } from "vitest";
import {
  formatMessageTimestamp,
  formatRelativeTime,
  generateTitle,
  isValidTitle,
  MAX_TITLE_LENGTH,
  pickNextActiveSession,
  sortSessions,
} from "./history";
import type { PersistedSession } from "./api";

const session = (over: Partial<PersistedSession>): PersistedSession => ({
  id: over.id ?? "s",
  title: over.title ?? null,
  createdAt: over.createdAt ?? 0,
  updatedAt: over.updatedAt ?? 0,
  codexSessionId: over.codexSessionId ?? null,
});

describe("generateTitle", () => {
  it("uses a short prompt as-is", () => {
    expect(generateTitle("Fix the login bug")).toBe("Fix the login bug");
  });

  it("trims surrounding whitespace and collapses internal runs", () => {
    expect(generateTitle("  hello   \n  world  ")).toBe("hello world");
  });

  it("trims a long prompt to a readable title on a word boundary, within the cap", () => {
    const long =
      "Please refactor the authentication module so that it supports both " +
      "password and passkey login while keeping the existing session cookie " +
      "behaviour intact across browser restarts";
    const title = generateTitle(long);
    // No ellipsis suffix: the cap is the hard limit so generated titles stay
    // conformant with isValidTitle (which rejects > MAX_TITLE_LENGTH).
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    // Breaks on a word boundary, so the last visible word is whole.
    expect(title).not.toMatch(/\s$/);
    expect(long.startsWith(title)).toBe(true);
    // The generated title is always itself a valid title.
    expect(isValidTitle(title)).toBe(true);
  });

  it("strips disallowed symbols from a generated title, keeping words", () => {
    expect(generateTitle("Fix the login-bug! @ user's page")).toBe(
      "Fix the login-bug user's page",
    );
    expect(generateTitle("C++ vs Rust?")).toBe("C vs Rust");
  });

  it("returns an empty string for a blank or symbol-only prompt", () => {
    expect(generateTitle("   \n  ")).toBe("");
    expect(generateTitle("@#$%^&*")).toBe("");
  });

  it("never returns a non-empty title that would fail validation", () => {
    // First alphanumeric sits past the cap, so any allowed prefix is
    // punctuation-only — generate nothing rather than an invalid title.
    const leadingPunct = `${".".repeat(MAX_TITLE_LENGTH + 1)} hello`;
    const title = generateTitle(leadingPunct);
    expect(title === "" || isValidTitle(title)).toBe(true);
    expect(title).toBe("");
  });
});

describe("isValidTitle", () => {
  it("accepts letters, digits, spaces, and basic punctuation", () => {
    expect(isValidTitle("Fix login bug")).toBe(true);
    expect(isValidTitle("Plan v2.1 (draft), part 1")).toBe(true);
    expect(isValidTitle("Don't break it")).toBe(true);
    expect(isValidTitle("1")).toBe(true);
  });

  it("rejects empty or whitespace-only titles", () => {
    expect(isValidTitle("")).toBe(false);
    expect(isValidTitle("   ")).toBe(false);
  });

  it("rejects titles with no letter or digit", () => {
    expect(isValidTitle("...")).toBe(false);
    expect(isValidTitle("()")).toBe(false);
  });

  it("rejects special symbols", () => {
    expect(isValidTitle("hello@world")).toBe(false);
    expect(isValidTitle("100%")).toBe(false);
    expect(isValidTitle("a/b")).toBe(false);
    expect(isValidTitle("emoji 🎉")).toBe(false);
  });

  it("rejects titles longer than the cap and accepts the boundary", () => {
    expect(isValidTitle("a".repeat(MAX_TITLE_LENGTH))).toBe(true);
    expect(isValidTitle("a".repeat(MAX_TITLE_LENGTH + 1))).toBe(false);
  });

  it("ignores surrounding whitespace when measuring length", () => {
    expect(isValidTitle(`  ${"a".repeat(MAX_TITLE_LENGTH)}  `)).toBe(true);
  });
});

describe("formatRelativeTime", () => {
  const S = 1000;
  const M = 60 * S;
  const H = 60 * M;
  const D = 24 * H;
  const now = 10_000_000_000_000;
  const ago = (ms: number) => formatRelativeTime(now - ms, now);

  it("reads 'now' under a minute", () => {
    expect(ago(0)).toBe("now");
    expect(ago(59 * S)).toBe("now");
  });

  it("reads minutes up to an hour", () => {
    expect(ago(60 * S)).toBe("1m");
    expect(ago(59 * M)).toBe("59m");
  });

  it("reads hours up to a day", () => {
    expect(ago(60 * M)).toBe("1h");
    expect(ago(23 * H)).toBe("23h");
  });

  it("reads days up to a week", () => {
    expect(ago(D)).toBe("1d");
    expect(ago(6 * D)).toBe("6d");
  });

  it("reads weeks up to a month", () => {
    expect(ago(7 * D)).toBe("1w");
    expect(ago(29 * D)).toBe("4w");
  });

  it("reads months up to a year", () => {
    expect(ago(30 * D)).toBe("1M");
    expect(ago(359 * D)).toBe("11M");
  });

  it("reads years past a year, including the 360-364 day gap", () => {
    expect(ago(360 * D)).toBe("1y");
    expect(ago(365 * D)).toBe("1y");
    expect(ago(730 * D)).toBe("2y");
  });

  it("clamps a future timestamp to 'now'", () => {
    expect(formatRelativeTime(now + 5 * M, now)).toBe("now");
  });
});

describe("formatMessageTimestamp", () => {
  // Build local-time dates so the 24h clock assertions are timezone-stable
  // (the formatter reads the same local fields it is given).
  const at = (...parts: [number, number, number, number, number]) =>
    new Date(parts[0], parts[1], parts[2], parts[3], parts[4]).getTime();
  const now = at(2026, 5, 5, 9, 0); // Jun 5 2026, 09:00 local

  it("shows 24h clock time only for a message from today", () => {
    expect(formatMessageTimestamp(at(2026, 5, 5, 14, 32), now)).toBe("14:32");
  });

  it("zero-pads hours and minutes in 24h form", () => {
    expect(formatMessageTimestamp(at(2026, 5, 5, 8, 5), now)).toBe("08:05");
    expect(formatMessageTimestamp(at(2026, 5, 5, 0, 0), now)).toBe("00:00");
    expect(formatMessageTimestamp(at(2026, 5, 5, 23, 9), now)).toBe("23:09");
  });

  it("prefixes a date when the message is not from today", () => {
    const out = formatMessageTimestamp(at(2026, 5, 4, 14, 32), now);
    expect(out).toMatch(/, 14:32$/);
    expect(out).not.toBe("14:32");
  });
});

describe("sortSessions", () => {
  it("orders by updatedAt descending, tie-breaking on id ascending", () => {
    const a = session({ id: "a", updatedAt: 100 });
    const b = session({ id: "b", updatedAt: 300 });
    const c = session({ id: "c", updatedAt: 100 });
    const sorted = sortSessions([a, b, c]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      session({ id: "a", updatedAt: 1 }),
      session({ id: "b", updatedAt: 2 }),
    ];
    sortSessions(input);
    expect(input.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("pickNextActiveSession", () => {
  it("returns the most recently updated remaining session", () => {
    const sessions = [
      session({ id: "a", updatedAt: 100 }),
      session({ id: "b", updatedAt: 300 }),
      session({ id: "c", updatedAt: 200 }),
    ];
    expect(pickNextActiveSession(sessions, "b")).toBe("c");
  });

  it("returns null when deleting the only session", () => {
    expect(pickNextActiveSession([session({ id: "only" })], "only")).toBeNull();
  });
});
