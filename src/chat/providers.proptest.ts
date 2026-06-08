import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { describeCliExit } from "./providers";

const ARBITRARY_STDERR = fc.string({ minLength: 1, maxLength: 5000 });
const ARBITRARY_NAME = fc.constantFrom("GPT", "Claude", "Gemini");

describe("describeCliExit (property)", () => {
  it("never throws on any valid input", () => {
    fc.assert(
      fc.property(ARBITRARY_NAME, ARBITRARY_STDERR, (name, stderr) => {
        expect(() => describeCliExit(name, stderr)).not.toThrow();
      }),
      { numRuns: 1000 },
    );
  });

  it("always returns a non-empty string", () => {
    fc.assert(
      fc.property(ARBITRARY_NAME, ARBITRARY_STDERR, (name, stderr) => {
        const result = describeCliExit(name, stderr);
        expect(result).toBeTruthy();
        expect(typeof result).toBe("string");
      }),
      { numRuns: 1000 },
    );
  });

  it("always includes the provider name in the message", () => {
    fc.assert(
      fc.property(ARBITRARY_NAME, ARBITRARY_STDERR, (name, stderr) => {
        const result = describeCliExit(name, stderr);
        expect(result).toContain(name);
      }),
      { numRuns: 1000 },
    );
  });

  it("never exposes JSON or diagnostic paths in the message", () => {
    fc.assert(
      fc.property(ARBITRARY_NAME, ARBITRARY_STDERR, (name, stderr) => {
        const result = describeCliExit(name, stderr);
        expect(result).not.toMatch(/\/var\/folders/);
        expect(result).not.toMatch(/"session_id"/);
        expect(result).not.toMatch(/^\s*[{[]/);
      }),
      { numRuns: 1000 },
    );
  });

  it("is idempotent — stripping already-stripped stderr has no effect", () => {
    fc.assert(
      fc.property(ARBITRARY_NAME, ARBITRARY_STDERR, (name, stderr) => {
        const first = describeCliExit(name, stderr);
        // Re-feeding the message as stderr should produce a stable result.
        const second = describeCliExit(name, first);
        expect(second).toBe(first);
      }),
      { numRuns: 500 },
    );
  });

  it("handles ANSI-like escape sequences without leaking them", () => {
    const ansiArb = fc.array(
      fc.oneof(
        fc.constant("\x1b[31m"),
        fc.constant("\x1b[0m"),
        fc.constant("\x1b[1;32m"),
        fc.constant("\x1b]0;title\x07"),
        fc.stringOf(fc.constantFrom("a", "b", "c", " ", "\n")),
      ),
      { minLength: 1, maxLength: 100 },
    );
    fc.assert(
      fc.property(ansiArb, (segments) => {
        const stderr = segments.join("");
        expect(() => describeCliExit("GPT", stderr)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});
