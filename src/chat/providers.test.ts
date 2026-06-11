import { describe, it, expect } from "vitest";
import {
  ALL_PROVIDER_IDS,
  DEFAULT_ROUTE,
  describeCliExit,
  describeProviderError,
  messageLabel,
  providerInfo,
  routeLabel,
  routeTargets,
  routesEqual,
} from "./providers";

describe("[smoke] providers", () => {
  it("defaults to a single GPT (Codex) route", () => {
    expect(DEFAULT_ROUTE).toEqual({ kind: "single", provider: "codex" });
  });

  it("lists the three active providers in display order", () => {
    expect(ALL_PROVIDER_IDS).toEqual(["codex", "claude", "gemini"]);
  });

  it("labels Codex as GPT (never 'Codex')", () => {
    expect(providerInfo("codex").label).toBe("GPT");
    expect(routeLabel({ kind: "single", provider: "codex" })).toBe("GPT");
    expect(routeLabel({ kind: "all" })).toBe("All");
  });

  it("resolves route targets for single and All routes", () => {
    expect(routeTargets({ kind: "single", provider: "claude" })).toEqual(["claude"]);
    // EP: no activeProviders — falls back to ALL_PROVIDER_IDS
    expect(routeTargets({ kind: "all" })).toEqual(["codex", "claude", "gemini"]);
  });

  it("returns [] for a single route whose provider is not in activeProviders", () => {
    expect(
      routeTargets({ kind: "single", provider: "codex" }, ["claude", "gemini"]),
    ).toEqual([]);
    expect(routeTargets({ kind: "single", provider: "codex" }, ["codex"])).toEqual([
      "codex",
    ]);
    // EP: empty activeProviders — no filter, falls back
    expect(routeTargets({ kind: "single", provider: "codex" }, [])).toEqual(["codex"]);
  });

  it("filters All-route targets to the enabled providers while preserving display order", () => {
    // EP: partial activeProviders — filters to enabled set, preserves PROVIDERS order.
    expect(routeTargets({ kind: "all" }, ["claude", "gemini"])).toEqual([
      "claude",
      "gemini",
    ]);
    // EP: order-scrambled input — canonical PROVIDERS order is always the output order.
    expect(routeTargets({ kind: "all" }, ["gemini", "claude"])).toEqual([
      "claude",
      "gemini",
    ]);
    // EP: single active provider — returns only that one.
    expect(routeTargets({ kind: "all" }, ["gemini"])).toEqual(["gemini"]);
    // EP: empty activeProviders — falls back to ALL_PROVIDER_IDS (no callers pass
    // empty intentionally; guard preserves backward compatibility).
    expect(routeTargets({ kind: "all" }, [])).toEqual(["codex", "claude", "gemini"]);
  });

  it("includes enabled custom CLIs in All-route targets, built-ins first (SP-072)", () => {
    expect(
      routeTargets({ kind: "all" }, ["codex", { custom: "OpenCode" }, "gemini"]),
    ).toEqual(["codex", "gemini", { custom: "OpenCode" }]);
  });

  it("routes a single custom provider and respects the active filter (SP-072)", () => {
    expect(
      routeTargets({ kind: "single", provider: { custom: "OpenCode" } }, [
        { custom: "OpenCode" },
      ]),
    ).toEqual([{ custom: "OpenCode" }]);
    // Custom provider not in the active set → no targets.
    expect(
      routeTargets({ kind: "single", provider: { custom: "OpenCode" } }, ["codex"]),
    ).toEqual([]);
  });

  it("compares routes by target", () => {
    expect(routesEqual({ kind: "all" }, { kind: "all" })).toBe(true);
    expect(
      routesEqual(
        { kind: "single", provider: "codex" },
        { kind: "single", provider: "codex" },
      ),
    ).toBe(true);
    expect(
      routesEqual(
        { kind: "single", provider: "codex" },
        { kind: "single", provider: "claude" },
      ),
    ).toBe(false);
    expect(routesEqual({ kind: "all" }, { kind: "single", provider: "codex" })).toBe(
      false,
    );
  });

  it("uses snapshotted model and reasoning for every provider badge", () => {
    expect(messageLabel("codex", "gpt-5.5", "low")).toBe("gpt-5.5-low");
    expect(messageLabel("claude", "haiku", "low")).toBe("haiku-low");
    expect(messageLabel("gemini", "gemini-3-flash-preview", "none")).toBe(
      "gemini-3-flash-preview-none",
    );
    expect(messageLabel(undefined, undefined, undefined)).toBe("Assistant");
  });

  it("names the failing provider in error-card text", () => {
    expect(describeProviderError({ kind: "timedOut" }, "claude")).toMatch(
      /Claude timed out/i,
    );
    expect(describeProviderError({ kind: "notAuthenticated" }, "gemini")).toMatch(
      /Gemini is not authenticated/i,
    );
    expect(
      describeProviderError({ kind: "nonZeroExit", code: 1, stderr: "boom" }, "codex"),
    ).toMatch(/GPT exited with an error: boom/i);
  });

  it("reduces noisy CLI stderr to its useful error summary", () => {
    const stderr = [
      "Ripgrep is not available. Falling back to GrepTool.",
      "[ERROR] [IDEClient] Directory mismatch.",
      "Error when talking to Gemini API",
      "Full report available at: /var/folders/example/gemini-client-error.json",
      "ModelNotFoundError: Requested entity was not found.",
      "    at classifyGoogleError (file:///gemini/chunk.js:304138:12)",
      "    at async GeminiChat.streamWithRetries (file:///gemini/chunk.js:328079:29)",
      '{ "session_id": "secret", "error": { "type": "Error", "message": "Requested entity was not found." } }',
    ].join("\n");

    expect(
      describeProviderError({ kind: "nonZeroExit", code: 404, stderr }, "gemini"),
    ).toBe("Gemini exited with an error: Requested entity was not found.");
  });

  it("caps over-length CLI stderr in the visible error card", () => {
    const message = describeProviderError(
      { kind: "nonZeroExit", code: 1, stderr: "x".repeat(2_000) },
      "claude",
    );

    expect(message.length).toBeLessThanOrEqual(280);
    expect(message).toContain("…");
  });

  it("uses the generic message for whitespace-only stderr", () => {
    expect(
      describeProviderError({ kind: "nonZeroExit", code: 1, stderr: " \n\t " }, "codex"),
    ).toBe("GPT exited with an error.");
  });

  it("extracts a named error from a single-line diagnostic dump", () => {
    expect(
      describeProviderError(
        {
          kind: "nonZeroExit",
          code: 404,
          stderr:
            "warning ModelNotFoundError: Requested entity was not found. at classifyGoogleError (chunk.js:1) { code: 404 }",
        },
        "gemini",
      ),
    ).toBe("Gemini exited with an error: Requested entity was not found.");
  });

  it("keeps the exact detail limit and truncates the next character", () => {
    const atLimit = describeCliExit("GPT", "x".repeat(240));
    const overLimit = describeCliExit("GPT", "x".repeat(241));

    expect(atLimit).toBe(`GPT exited with an error: ${"x".repeat(240)}.`);
    expect(overLimit).toBe(`GPT exited with an error: ${"x".repeat(239)}…`);
  });

  it.each([
    "Full report available at: /tmp/error.json",
    "    at classifyError (chunk.js:1)\n    at async run (chunk.js:2)",
    '{"session_id":"secret","code":404}',
    '{\n  "session_id": "secret",\n  "code": 404\n}',
  ])("uses a generic message when stderr contains only diagnostic noise", (stderr) => {
    expect(describeCliExit("GPT", stderr)).toBe("GPT exited with an error.");
  });

  it("keeps a useful line before a pretty-printed structured dump", () => {
    const stderr = [
      "Directory mismatch. Run the CLI from the open workspace.",
      "{",
      '  "session_id": "secret",',
      "  code: 404",
      "}",
    ].join("\n");

    expect(describeCliExit("Gemini", stderr)).toBe(
      "Gemini exited with an error: Directory mismatch. Run the CLI from the open workspace.",
    );
  });
});
