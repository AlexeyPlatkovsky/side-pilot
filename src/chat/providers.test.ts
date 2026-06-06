import { describe, it, expect } from "vitest";
import {
  ALL_PROVIDER_IDS,
  DEFAULT_ROUTE,
  describeProviderError,
  messageLabel,
  providerInfo,
  routeLabel,
  routeTargets,
  routesEqual,
} from "./providers";
import { assistantModelLabel } from "./config";

describe("providers", () => {
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
    expect(routeTargets({ kind: "all" })).toEqual(["codex", "claude", "gemini"]);
  });

  it("compares routes by target", () => {
    expect(routesEqual({ kind: "all" }, { kind: "all" })).toBe(true);
    expect(
      routesEqual({ kind: "single", provider: "codex" }, { kind: "single", provider: "codex" }),
    ).toBe(true);
    expect(
      routesEqual({ kind: "single", provider: "codex" }, { kind: "single", provider: "claude" }),
    ).toBe(false);
    expect(routesEqual({ kind: "all" }, { kind: "single", provider: "codex" })).toBe(false);
  });

  it("keeps the model/effort badge for GPT but plain names for others", () => {
    expect(messageLabel("codex")).toBe(assistantModelLabel);
    expect(messageLabel("claude")).toBe("Claude");
    expect(messageLabel("gemini")).toBe("Gemini");
    expect(messageLabel(undefined)).toBe("Assistant");
  });

  it("names the failing provider in error-card text", () => {
    expect(describeProviderError({ kind: "timedOut" }, "claude")).toMatch(/Claude timed out/i);
    expect(describeProviderError({ kind: "notAuthenticated" }, "gemini")).toMatch(
      /Gemini is not authenticated/i,
    );
    expect(
      describeProviderError({ kind: "nonZeroExit", code: 1, stderr: "boom" }, "codex"),
    ).toMatch(/GPT exited with an error: boom/i);
  });
});
