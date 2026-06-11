import { describe, it, expect } from "vitest";
import {
  isCustomAssistant,
  customName,
  assistantKey,
  sameAssistant,
} from "./assistantId";

describe("assistantId helpers", () => {
  it("isCustomAssistant distinguishes the object branch from built-in strings", () => {
    expect(isCustomAssistant("codex")).toBe(false);
    expect(isCustomAssistant("claude")).toBe(false);
    expect(isCustomAssistant({ custom: "OpenCode" })).toBe(true);
  });

  it("customName returns the name for custom ids and undefined for built-ins", () => {
    expect(customName({ custom: "OpenCode" })).toBe("OpenCode");
    expect(customName("gemini")).toBeUndefined();
  });

  it("assistantKey matches the Rust as_str: bare for built-ins, custom:<name> for custom", () => {
    expect(assistantKey("codex")).toBe("codex");
    expect(assistantKey({ custom: "OpenCode" })).toBe("custom:OpenCode");
  });

  it("assistantKey preserves case and survives a name containing a colon", () => {
    expect(assistantKey({ custom: "My:CLI" })).toBe("custom:My:CLI");
  });

  it("sameAssistant compares by key, not reference", () => {
    expect(sameAssistant({ custom: "OpenCode" }, { custom: "OpenCode" })).toBe(true);
    expect(sameAssistant({ custom: "OpenCode" }, { custom: "Other" })).toBe(false);
    expect(sameAssistant("codex", "codex")).toBe(true);
    expect(sameAssistant("codex", { custom: "codex" })).toBe(false);
  });
});
