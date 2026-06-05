/**
 * The chat's session list (SP-048–051): the reactive list that drives the rail
 * plus a ref mirror so async callbacks read the current list without a stale
 * closure. The list is always kept sorted by recency (`sortSessions`).
 *
 * Extracted from `useChat` so session-list loading/refresh lives in one place
 * (SP-067). The owning hook composes the operations (submit, new, delete, …)
 * on top of `apply`/`getSessions`/`refresh`.
 */
import { useCallback, useRef, useState } from "react";
import type { ChatApi, PersistedSession } from "./api";
import { sortSessions } from "./history";

export interface SessionList {
  /** Reactive, recency-sorted list for rendering the rail. */
  sessions: PersistedSession[];
  /** Current list read from the ref (no stale closure) for async callbacks. */
  getSessions: () => PersistedSession[];
  /** Replace the list, sorting it and mirroring it into the ref. */
  apply: (list: PersistedSession[]) => void;
  /** Reload the list from the backend and apply it. */
  refresh: () => Promise<void>;
}

export function useSessionList(api: ChatApi): SessionList {
  const [sessions, setSessions] = useState<PersistedSession[]>([]);
  const ref = useRef<PersistedSession[]>([]);

  const apply = useCallback((list: PersistedSession[]) => {
    const sorted = sortSessions(list);
    ref.current = sorted;
    setSessions(sorted);
  }, []);

  const refresh = useCallback(async () => {
    apply(await api.listSessions());
  }, [api, apply]);

  const getSessions = useCallback(() => ref.current, []);

  return { sessions, getSessions, apply, refresh };
}
