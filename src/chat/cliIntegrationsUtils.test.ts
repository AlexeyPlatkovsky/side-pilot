import { describe, it, expect } from "vitest";
import {
  mergeDetection,
  builtinEntry,
  customEntry,
  enabledProviderIds,
  enabledCount,
} from "./cliIntegrationsUtils";
import type { CliIntegrations } from "./generated/CliIntegrations";

function base(): CliIntegrations {
  return {
    codex: { assistant: "codex", enabled: true, detectedStatus: "available" },
    claude: { assistant: "claude", enabled: false, detectedStatus: "notInstalled" },
    gemini: { assistant: "gemini", enabled: true, detectedStatus: "notAuthenticated" },
    custom: [],
  };
}

describe("mergeDetection", () => {
  it("updates detectedStatus from detected list", () => {
    const result = mergeDetection(base(), [
      { assistant: "claude", enabled: false, detectedStatus: "available" },
    ]);
    expect(result.claude.detectedStatus).toBe("available");
  });

  it("preserves enabled flag from persisted regardless of detected value", () => {
    const result = mergeDetection(base(), [
      { assistant: "codex", enabled: false, detectedStatus: "available" },
    ]);
    // persisted.codex.enabled is true; detected.enabled is false — persisted wins
    expect(result.codex.enabled).toBe(true);
  });

  it("does not mutate the persisted argument", () => {
    const persisted = base();
    mergeDetection(persisted, [
      { assistant: "codex", enabled: false, detectedStatus: "notInstalled" },
    ]);
    expect(persisted.codex.detectedStatus).toBe("available");
  });

  it("leaves entries not in the detected list unchanged", () => {
    const result = mergeDetection(base(), [
      { assistant: "codex", enabled: true, detectedStatus: "notInstalled" },
    ]);
    expect(result.claude.detectedStatus).toBe("notInstalled");
    expect(result.gemini.detectedStatus).toBe("notAuthenticated");
  });

  it("handles an empty detected list (no-op)", () => {
    const result = mergeDetection(base(), []);
    expect(result.codex.detectedStatus).toBe("available");
    expect(result.claude.detectedStatus).toBe("notInstalled");
    expect(result.gemini.detectedStatus).toBe("notAuthenticated");
  });

  it("applies updates for all three providers when all are present", () => {
    const result = mergeDetection(base(), [
      { assistant: "codex", enabled: true, detectedStatus: "notInstalled" },
      { assistant: "claude", enabled: false, detectedStatus: "available" },
      { assistant: "gemini", enabled: true, detectedStatus: "available" },
    ]);
    expect(result.codex.detectedStatus).toBe("notInstalled");
    expect(result.claude.detectedStatus).toBe("available");
    expect(result.gemini.detectedStatus).toBe("available");
  });
});

describe("builtinEntry", () => {
  it("returns codex entry for 'codex'", () => {
    const integrations = base();
    expect(builtinEntry(integrations, "codex")).toBe(integrations.codex);
  });

  it("returns claude entry for 'claude'", () => {
    const integrations = base();
    expect(builtinEntry(integrations, "claude")).toBe(integrations.claude);
  });

  it("returns gemini entry for 'gemini'", () => {
    const integrations = base();
    expect(builtinEntry(integrations, "gemini")).toBe(integrations.gemini);
  });

  it("returns a mutable reference — mutations via findEntry affect the original", () => {
    const integrations = base();
    const entry = builtinEntry(integrations, "codex")!;
    entry.enabled = false;
    expect(integrations.codex.enabled).toBe(false);
  });

  it("returns null for a custom id (built-in slots only)", () => {
    expect(builtinEntry(base(), { custom: "OpenCode" })).toBeNull();
  });
});

// ---- Custom CLI helpers (SP-072) ----------------------------------------

function withCustom(): CliIntegrations {
  return {
    codex: { assistant: "codex", enabled: true, detectedStatus: "available" },
    claude: { assistant: "claude", enabled: false, detectedStatus: "notInstalled" },
    gemini: { assistant: "gemini", enabled: true, detectedStatus: "available" },
    custom: [
      {
        name: "OpenCode",
        command: "opencode --prompt",
        enabled: true,
        detectedStatus: "available",
      },
      { name: "Cline", command: "cline", enabled: false, detectedStatus: "notDetected" },
    ],
  };
}

describe("mergeDetection (custom)", () => {
  it("updates a custom entry's status by name and preserves its enabled flag", () => {
    const result = mergeDetection(withCustom(), [
      { assistant: { custom: "Cline" }, enabled: true, detectedStatus: "available" },
    ]);
    const cline = result.custom.find((e) => e.name === "Cline")!;
    expect(cline.detectedStatus).toBe("available");
    expect(cline.enabled).toBe(false); // persisted enabled wins over detected
  });

  it("ignores a custom detection result with no matching name", () => {
    const result = mergeDetection(withCustom(), [
      { assistant: { custom: "Unknown" }, enabled: true, detectedStatus: "available" },
    ]);
    expect(result.custom.map((e) => e.detectedStatus)).toEqual([
      "available",
      "notDetected",
    ]);
  });
});

describe("customEntry", () => {
  it("finds a custom entry by name and returns null when absent", () => {
    const integrations = withCustom();
    expect(customEntry(integrations, "OpenCode")?.command).toBe("opencode --prompt");
    expect(customEntry(integrations, "Nope")).toBeNull();
  });
});

describe("enabledProviderIds", () => {
  it("lists enabled built-ins first then enabled custom CLIs", () => {
    expect(enabledProviderIds(withCustom())).toEqual([
      "codex",
      "gemini",
      { custom: "OpenCode" },
    ]);
  });

  it("returns only built-ins when no custom CLI is enabled", () => {
    expect(enabledProviderIds(base())).toEqual(["codex", "gemini"]);
  });
});

describe("enabledCount", () => {
  it("counts enabled built-ins and custom CLIs together", () => {
    expect(enabledCount(withCustom())).toBe(3); // codex + gemini + OpenCode
    expect(enabledCount(base())).toBe(2);
  });
});
