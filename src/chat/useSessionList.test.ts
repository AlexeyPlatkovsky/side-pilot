import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSessionList } from "./useSessionList";
import type { ChatApi, PersistedSession } from "./api";

const session = (id: string, updatedAt: number): PersistedSession => ({
  id,
  title: id,
  createdAt: 0,
  updatedAt,
  codexSessionId: null,
});

describe("useSessionList", () => {
  it("starts empty", () => {
    const api = { listSessions: vi.fn() } as unknown as ChatApi;
    const { result } = renderHook(() => useSessionList(api));
    expect(result.current.sessions).toEqual([]);
    expect(result.current.getSessions()).toEqual([]);
  });

  it("apply() sorts by recency and mirrors into the ref read", () => {
    const api = { listSessions: vi.fn() } as unknown as ChatApi;
    const { result } = renderHook(() => useSessionList(api));

    act(() => result.current.apply([session("old", 1), session("new", 2)]));

    // sortSessions orders most-recently-updated first.
    expect(result.current.sessions.map((s) => s.id)).toEqual(["new", "old"]);
    expect(result.current.getSessions().map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("refresh() loads from the api and applies the sorted result", async () => {
    const api = {
      listSessions: vi.fn(() => Promise.resolve([session("a", 1), session("b", 3)])),
    } as unknown as ChatApi;
    const { result } = renderHook(() => useSessionList(api));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() =>
      expect(result.current.sessions.map((s) => s.id)).toEqual(["b", "a"]),
    );
    expect(api.listSessions).toHaveBeenCalledTimes(1);
  });
});
