/**
 * Per-session rail status for the chat (SP-056): which chats have a reply in
 * flight (pending → spinner) and which received a reply while not active
 * (unread → dot).
 *
 * Each set is kept in both React state (so the rail re-renders) and a ref (so
 * the chat's async callbacks read the current membership without a stale
 * closure). This hook owns that ref+state pairing behind named operations so
 * callers never reach for the raw refs or hand-roll the immutable-copy update
 * (SP-067/SP-068).
 */
import { useCallback, useRef, useState } from "react";

/** Shared empty set so an unchanged status keeps a stable identity. */
const EMPTY_IDS: ReadonlySet<string> = new Set();

export interface ChatStatus {
  /** Sessions with a reply in flight — drives the rail spinner. */
  pendingIds: ReadonlySet<string>;
  /** Sessions whose reply arrived while inactive — drives the unread dot. */
  unreadIds: ReadonlySet<string>;
  /** Current pending membership, read from the ref (no stale closure). */
  isPending: (id: string) => boolean;
  markPending: (id: string) => void;
  clearPending: (id: string) => void;
  markUnread: (id: string) => void;
  clearUnread: (id: string) => void;
  /** Drop a session from both sets (delete/clear flows). */
  forget: (id: string) => void;
}

export function useChatStatus(): ChatStatus {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const [unreadIds, setUnreadIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const pendingRef = useRef<ReadonlySet<string>>(EMPTY_IDS);
  const unreadRef = useRef<ReadonlySet<string>>(EMPTY_IDS);

  // Update a set through its ref+state together with a fresh immutable copy so
  // React sees a new identity and async readers see the latest value.
  const edit = useCallback(
    (
      ref: React.MutableRefObject<ReadonlySet<string>>,
      setState: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>,
      mutate: (working: Set<string>) => void,
    ) => {
      const next = new Set(ref.current);
      mutate(next);
      ref.current = next;
      setState(next);
    },
    [],
  );

  const markPending = useCallback(
    (id: string) => edit(pendingRef, setPendingIds, (s) => s.add(id)),
    [edit],
  );
  const clearPending = useCallback(
    (id: string) => edit(pendingRef, setPendingIds, (s) => s.delete(id)),
    [edit],
  );
  const markUnread = useCallback(
    (id: string) => edit(unreadRef, setUnreadIds, (s) => s.add(id)),
    [edit],
  );
  const clearUnread = useCallback(
    (id: string) => edit(unreadRef, setUnreadIds, (s) => s.delete(id)),
    [edit],
  );
  const forget = useCallback(
    (id: string) => {
      clearPending(id);
      clearUnread(id);
    },
    [clearPending, clearUnread],
  );
  const isPending = useCallback((id: string) => pendingRef.current.has(id), []);

  return {
    pendingIds,
    unreadIds,
    isPending,
    markPending,
    clearPending,
    markUnread,
    clearUnread,
    forget,
  };
}
