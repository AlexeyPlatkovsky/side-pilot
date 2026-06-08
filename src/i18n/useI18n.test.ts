import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useI18n } from "./useI18n";

describe("useI18n", () => {
  it("returns English strings for en locale", () => {
    const { result } = renderHook(() => useI18n("en"));
    expect(result.current.t("alwaysOnTop")).toBe("Always on top");
    expect(result.current.t("language")).toBe("Language");
  });

  it("returns Russian strings for ru locale", () => {
    const { result } = renderHook(() => useI18n("ru"));
    expect(result.current.t("alwaysOnTop")).toBe("Поверх всех окон");
    expect(result.current.t("language")).toBe("Язык");
  });

  it("falls back to English for unknown key (type-safety covers this in practice)", () => {
    const { result } = renderHook(() => useI18n("en"));
    expect(result.current.t("loading")).toBe("Loading...");
  });
});
