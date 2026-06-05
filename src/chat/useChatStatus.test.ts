import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChatStatus } from "./useChatStatus";

describe("useChatStatus", () => {
  it("starts with empty pending/unread sets", () => {
    const { result } = renderHook(() => useChatStatus());
    expect(result.current.pendingIds.size).toBe(0);
    expect(result.current.unreadIds.size).toBe(0);
    expect(result.current.isPending("a")).toBe(false);
  });

  it("marks and clears pending, exposing a ref-backed current read", () => {
    const { result } = renderHook(() => useChatStatus());

    act(() => result.current.markPending("a"));
    expect(result.current.pendingIds.has("a")).toBe(true);
    // `isPending` reads the ref synchronously (no stale closure), so it sees the
    // value even within the same tick a caller just set.
    expect(result.current.isPending("a")).toBe(true);

    act(() => result.current.clearPending("a"));
    expect(result.current.pendingIds.has("a")).toBe(false);
    expect(result.current.isPending("a")).toBe(false);
  });

  it("marks and clears unread independently of pending", () => {
    const { result } = renderHook(() => useChatStatus());

    act(() => result.current.markUnread("b"));
    expect(result.current.unreadIds.has("b")).toBe(true);
    expect(result.current.pendingIds.has("b")).toBe(false);

    act(() => result.current.clearUnread("b"));
    expect(result.current.unreadIds.has("b")).toBe(false);
  });

  it("forget() drops a session from both sets", () => {
    const { result } = renderHook(() => useChatStatus());

    act(() => {
      result.current.markPending("c");
      result.current.markUnread("c");
    });
    act(() => result.current.forget("c"));

    expect(result.current.pendingIds.has("c")).toBe(false);
    expect(result.current.unreadIds.has("c")).toBe(false);
  });

  it("publishes a new set identity on each change so React re-renders", () => {
    const { result } = renderHook(() => useChatStatus());
    const before = result.current.pendingIds;

    act(() => result.current.markPending("d"));

    expect(result.current.pendingIds).not.toBe(before);
  });
});
