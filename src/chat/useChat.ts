import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { chatReducer, initialChatState, type ChatMessage } from "../state/chat";
import {
  describeError,
  toChatMessage,
  type ChatApi,
  type PersistedSession,
} from "../chat/api";
import { generateTitle, pickNextActiveSession, sortSessions } from "../chat/history";
import { useChatStatus } from "../chat/useChatStatus";
import { useSessionList } from "../chat/useSessionList";
import {
  ALL_PROVIDER_IDS,
  describeProviderError,
  routeTargets,
  type ActiveRoute,
} from "../chat/providers";
import type { AssistantId } from "../chat/generated/AssistantId";
import { translate } from "../i18n/translations";
import type { Locale } from "../i18n/types";

export type RoutesBySession = Record<string, ActiveRoute>;

const COMPOSER_INPUT_MIN_HEIGHT = 32;

export { COMPOSER_INPUT_MIN_HEIGHT };

/** Stable id for an optimistic (not-yet-persisted) message row. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

interface ActiveSession {
  id: string;
  codexSessionId: string | null;
  title: string | null;
}

export interface PendingTurn {
  userMessage: ChatMessage;
  slots: ChatMessage[];
  knownMessageIds: Set<string>;
}

export function mergePendingTurn(
  history: ChatMessage[],
  pending?: PendingTurn,
): ChatMessage[] {
  if (!pending) return history;
  const last = history.at(-1);
  const userAlreadyPersisted =
    last?.sender === "user" &&
    last.content === pending.userMessage.content &&
    !pending.knownMessageIds.has(last.id);
  return [
    ...history,
    ...(userAlreadyPersisted ? [] : [pending.userMessage]),
    ...pending.slots,
  ];
}

/**
 * Chat logic hook (SP-006, SP-048–051, SP-017). Owns the transcript reducer plus
 * the session list and the active session, and wires every chat operation through
 * the injected [`ChatApi`]: prompt submission via the multi-provider route
 * (`run_route` persists the prompt and each provider's reply server-side and
 * returns one outcome per target; the client shows an optimistic user message
 * plus one labeled pending slot per provider, then swaps in replies or inline
 * error cards), titling an untitled chat from its first prompt, session
 * switching, new/rename/delete, and clear. Multi-provider continuity is carried
 * by app-owned transcript replay (§6), not native session resume. The local
 * store is the display source of truth, so the transcript and list are
 * (re)loaded from it.
 */
export function useChat(api: ChatApi, enabled = true, locale: Locale = "en") {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Session list (reactive + ref read) and per-session rail status (pending /
  // unread). These focused hooks own their ref+state bookkeeping (SP-067/068);
  // `useChat` is the orchestration layer composing them.
  const { sessions, getSessions, apply: applySessions, refresh } = useSessionList(api);
  const {
    pendingIds,
    unreadIds,
    isPending,
    markPending,
    clearPending,
    markUnread,
    clearUnread,
    forget,
  } = useChatStatus();
  // Ref mirrors the active session so async callbacks read the current one
  // without a stale closure.
  const activeRef = useRef<ActiveSession | null>(null);
  // Pending turns are session-scoped UI state. Keep their optimistic prompt and
  // provider slots outside the active transcript so switching chats can
  // reconstruct the complete in-flight turn.
  const pendingTurnsRef = useRef<Map<string, PendingTurn>>(new Map());
  const knownMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());
  // A session history read may finish after a later selection. Only the latest
  // selection intent may activate a chat.
  const selectionRequestRef = useRef(0);
  const selectionTargetRef = useRef<string | null>(null);

  const setActive = useCallback(
    (session: PersistedSession, messages: ChatMessage[]) => {
      knownMessageIdsRef.current.set(
        session.id,
        new Set(messages.map((message) => message.id)),
      );
      activeRef.current = {
        id: session.id,
        codexSessionId: session.codexSessionId,
        title: session.title,
      };
      setActiveSessionId(session.id);
      // Restore the thinking state if this chat still has a reply in flight, so
      // switching back to it shows "Thinking…" instead of an idle transcript.
      dispatch({
        type: "loaded",
        messages: mergePendingTurn(messages, pendingTurnsRef.current.get(session.id)),
        pending: isPending(session.id),
      });
    },
    [isPending],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listSessions();
        const sorted = sortSessions(list);
        const session = sorted[0] ?? (await api.createSession());
        const history = await api.readHistory(session.id);
        if (cancelled) return;
        applySessions(sorted.length ? sorted : [session]);
        setActive(session, history.map(toChatMessage));
      } catch (err) {
        if (!cancelled) dispatch({ type: "error", message: describeError(err, locale) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, applySessions, enabled, setActive, locale]);

  const submit = useCallback(
    async (
      prompt: string,
      route: ActiveRoute,
      activeProviders?: AssistantId[],
    ) => {
      const trimmed = prompt.trim();
      const session = activeRef.current;
      if (!trimmed || !session) return;
      // The chat this turn belongs to. A blocking reply can take seconds, during
      // which the user may switch to another chat; the late reply must land in
      // (and only re-render) its originating chat, never whichever is now active.
      const originId = session.id;
      const targets = routeTargets(route, activeProviders);

      const userMessage: ChatMessage = {
        id: newId(),
        sender: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      // One labeled pending slot per target provider so the user sees each
      // provider "loading" until the route settles (SP-017).
      const slots: ChatMessage[] = targets.map((provider) => ({
        id: `pending-${provider}-${newId()}`,
        sender: "assistant",
        assistantId: provider,
        content: "",
        createdAt: Date.now(),
        pending: true,
      }));
      // Show the user's message + provider slots immediately, enter the pending
      // state, and mark this chat in-flight so the rail shows a spinner (SP-056).
      dispatch({ type: "routeSubmit", userMessage, slots });
      pendingTurnsRef.current.set(originId, {
        userMessage,
        slots,
        knownMessageIds: new Set(knownMessageIdsRef.current.get(originId) ?? []),
      });
      markPending(originId);

      try {
        // Name a still-untitled chat from its first prompt (SP-049). `run_route`
        // persists the user prompt and each successful reply server-side, so the
        // client no longer appends them itself.
        if (!session.title?.trim()) {
          const generated = generateTitle(trimmed);
          if (generated) {
            const updated = await api.renameSession(session.id, generated);
            session.title = updated.title;
          }
        }
        const result = await api.runRoute({
          sessionId: session.id,
          route,
          prompt: trimmed,
          activeProviders: activeProviders ?? (ALL_PROVIDER_IDS as AssistantId[]),
        });
        knownMessageIdsRef.current.set(
          originId,
          new Set([
            ...(knownMessageIdsRef.current.get(originId) ?? []),
            result.userMessage.id,
            ...result.outcomes.flatMap((outcome) =>
              outcome.message ? [outcome.message.id] : [],
            ),
          ]),
        );
        // This turn is no longer in flight.
        pendingTurnsRef.current.delete(originId);
        clearPending(originId);
        // Map each provider outcome to a transcript entry: a persisted reply, or
        // an inline error card under that provider's label.
        const results: ChatMessage[] = result.outcomes.map((outcome) =>
          outcome.message
            ? toChatMessage(outcome.message)
            : {
                id: `error-${outcome.provider}-${newId()}`,
                sender: "assistant",
                assistantId: outcome.provider,
                content: outcome.error
                  ? describeProviderError(outcome.error, outcome.provider, locale)
                  : translate(locale, "error_requestFailed"),
                createdAt: Date.now(),
                error: true,
              },
        );
        if (activeRef.current?.id === originId) {
          // Still viewing this chat — swap the pending slots for their results.
          dispatch({ type: "routeSettled", results });
        } else if (getSessions().some((s) => s.id === originId)) {
          // Replied in the background — flag it unread until the user opens it.
          // Skip if the chat was deleted meanwhile, so no phantom dot lingers.
          markUnread(originId);
        }
      } catch (err) {
        pendingTurnsRef.current.delete(originId);
        clearPending(originId);
        // Same guard: don't surface this turn's error in a chat the user moved to.
        if (activeRef.current?.id === originId) {
          dispatch({ type: "error", message: describeError(err, locale) });
        }
      } finally {
        // Refresh the rail so the active chat's new title/updated_at re-sorts it.
        try {
          await refresh();
        } catch {
          /* a list refresh failure must not clobber the transcript */
        }
      }
    },
    [api, refresh, getSessions, markPending, clearPending, markUnread, locale],
  );

  const selectSession = useCallback(
    async (id: string) => {
      const request = ++selectionRequestRef.current;
      selectionTargetRef.current = id;
      if (activeRef.current?.id === id) {
        selectionTargetRef.current = null;
        return;
      }
      const session = getSessions().find((s) => s.id === id);
      if (!session) {
        selectionTargetRef.current = null;
        return;
      }
      try {
        const history = await api.readHistory(id);
        if (request !== selectionRequestRef.current) return;
        selectionTargetRef.current = null;
        // Opening a chat clears its unread flag (SP-056).
        clearUnread(id);
        setActive(session, history.map(toChatMessage));
      } catch (err) {
        if (request === selectionRequestRef.current) {
          selectionTargetRef.current = null;
          dispatch({ type: "error", message: describeError(err, locale) });
        }
      }
    },
    [api, setActive, getSessions, clearUnread, locale],
  );

  const newChat = useCallback(async () => {
    const request = ++selectionRequestRef.current;
    selectionTargetRef.current = null;
    try {
      const created = await api.createSession();
      applySessions([...getSessions(), created]);
      if (request === selectionRequestRef.current) setActive(created, []);
    } catch (err) {
      dispatch({ type: "error", message: describeError(err, locale) });
    }
  }, [api, applySessions, getSessions, setActive, locale]);

  const renameSession = useCallback(
    async (id: string, title: string) => {
      try {
        const updated = await api.renameSession(id, title);
        if (activeRef.current?.id === id) activeRef.current.title = updated.title;
        applySessions(getSessions().map((s) => (s.id === id ? updated : s)));
      } catch (err) {
        dispatch({ type: "error", message: describeError(err, locale) });
      }
    },
    [api, applySessions, getSessions, locale],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      const wasActive = activeRef.current?.id === id;
      let activationRequest: number | null = null;
      if (wasActive || selectionTargetRef.current === id) {
        activationRequest = ++selectionRequestRef.current;
        selectionTargetRef.current = null;
      }
      const nextId = pickNextActiveSession(getSessions(), id);
      try {
        await api.deleteSession(id);
        // The chat is gone — drop any in-flight/unread status it held so the
        // sets don't leak ids for a session that no longer exists.
        forget(id);
        pendingTurnsRef.current.delete(id);
        knownMessageIdsRef.current.delete(id);
        const remaining = getSessions().filter((s) => s.id !== id);
        if (!wasActive) {
          applySessions(remaining);
          return;
        }
        if (nextId) {
          const next = remaining.find((s) => s.id === nextId)!;
          applySessions(remaining);
          const history = await api.readHistory(nextId);
          if (activationRequest === selectionRequestRef.current) {
            setActive(next, history.map(toChatMessage));
          }
        } else {
          // No chats remain — start a fresh empty one (session model).
          const created = await api.createSession();
          applySessions([created]);
          if (activationRequest === selectionRequestRef.current) setActive(created, []);
        }
      } catch (err) {
        dispatch({ type: "error", message: describeError(err, locale) });
      }
    },
    [api, applySessions, getSessions, setActive, forget, locale],
  );

  const clearActive = useCallback(async () => {
    const session = activeRef.current;
    if (!session) return;
    try {
      const cleared = await api.clearSession(session.id);
      session.codexSessionId = null;
      session.title = cleared.title;
      // A cleared chat is emptied, so it carries no in-flight/unread status.
      forget(cleared.id);
      pendingTurnsRef.current.delete(cleared.id);
      knownMessageIdsRef.current.set(cleared.id, new Set());
      dispatch({ type: "loaded", messages: [] });
      applySessions(getSessions().map((s) => (s.id === cleared.id ? cleared : s)));
    } catch (err) {
      dispatch({ type: "error", message: describeError(err, locale) });
    }
  }, [api, applySessions, getSessions, forget, locale]);

  const retry = useCallback(
    async (errorMessageId: string, provider: string, userContent: string) => {
      const session = activeRef.current;
      if (!session) return;
      const originId = session.id;

      const pendingSlot: ChatMessage = {
        id: `pending-retry-${newId()}`,
        sender: "assistant",
        assistantId: provider,
        content: "",
        createdAt: Date.now(),
        pending: true,
      };
      if (activeRef.current?.id === originId) {
        dispatch({ type: "retryReplace", errorMessageId, slot: pendingSlot });
      }

      try {
        const outcome = await api.retryRoute({
          sessionId: originId,
          errorMessageId,
          provider: provider as AssistantId,
          prompt: userContent,
        });
        if (activeRef.current?.id !== originId) return;
        const result: ChatMessage = outcome.message
          ? toChatMessage(outcome.message)
          : {
              id: `error-retry-${newId()}`,
              sender: "assistant",
              assistantId: provider,
              content: translate(locale, "error_retryRequestFailed"),
              createdAt: Date.now(),
              error: true,
            };
        dispatch({ type: "routeSettled", results: [result] });
      } catch (err) {
        if (activeRef.current?.id !== originId) return;
        dispatch({ type: "error", message: describeError(err, locale) });
      }
    },
    [api, dispatch, locale],
  );

  return {
    state,
    sessions,
    activeSessionId,
    pendingIds,
    unreadIds,
    submit,
    selectSession,
    newChat,
    renameSession,
    deleteSession,
    clearActive,
    retry,
  };
}

export type ChatController = ReturnType<typeof useChat>;
