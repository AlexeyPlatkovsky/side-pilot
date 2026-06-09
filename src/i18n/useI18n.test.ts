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

  it("supports interpolation with values", () => {
    const { result } = renderHook(() => useI18n("en"));
    expect(result.current.t("chat_clearConfirm", { title: "Test" })).toBe(
      "Clear this chat? All messages in \u201cTest\u201d will be permanently deleted and this conversation can\u2019t be resumed.",
    );
  });

  it("falls back to English for ru locale with missing key", () => {
    const { result } = renderHook(() => useI18n("ru"));
    expect(result.current.t("error")).toBe("Не удалось загрузить общие настройки.");
  });
});
