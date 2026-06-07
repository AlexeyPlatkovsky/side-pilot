import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatReducer, initialChatState, type ChatMessage } from "../state/chat";
import {
  describeError,
  inertChatApi,
  toChatMessage,
  type ChatApi,
  type PersistedSession,
} from "../chat/api";
import {
  formatMessageTimestamp,
  generateTitle,
  pickNextActiveSession,
  sortSessions,
} from "../chat/history";
import { useChatStatus } from "../chat/useChatStatus";
import { useSessionList } from "../chat/useSessionList";
import {
  ALL_PROVIDER_IDS,
  DEFAULT_ROUTE,
  describeProviderError,
  messageLabel,
  routeTargets,
  type ActiveRoute,
} from "../chat/providers";
import type { AssistantId } from "../chat/generated/AssistantId";
import { AiSwitcher } from "./AiSwitcher";
import { ChatHistory } from "./ChatHistory";
import { Dialog } from "./Dialog";
import { RenameDialog } from "./RenameDialog";

const COMPOSER_INPUT_MIN_HEIGHT = 32;
type RoutesBySession = Record<string, ActiveRoute>;

/** Stable id for an optimistic (not-yet-persisted) message row. */
function newId(): string {
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

interface PendingTurn {
  userMessage: ChatMessage;
  slots: ChatMessage[];
  knownMessageIds: Set<string>;
}

function mergePendingTurn(history: ChatMessage[], pending?: PendingTurn): ChatMessage[] {
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
export function useChat(api: ChatApi, enabled = true) {
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
      knownMessageIdsRef.current.set(session.id, new Set(messages.map((message) => message.id)));
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
        if (!cancelled) dispatch({ type: "error", message: describeError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, applySessions, enabled, setActive]);

  const submit = useCallback(
    async (prompt: string, route: ActiveRoute) => {
      const trimmed = prompt.trim();
      const session = activeRef.current;
      if (!trimmed || !session) return;
      // The chat this turn belongs to. A blocking reply can take seconds, during
      // which the user may switch to another chat; the late reply must land in
      // (and only re-render) its originating chat, never whichever is now active.
      const originId = session.id;
      const targets = routeTargets(route);

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
        if (!session.title || !session.title.trim()) {
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
          activeProviders: ALL_PROVIDER_IDS as AssistantId[],
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
                  ? describeProviderError(outcome.error, outcome.provider)
                  : "The request failed.",
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
          dispatch({ type: "error", message: describeError(err) });
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
    [api, refresh, getSessions, markPending, clearPending, markUnread],
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
          dispatch({ type: "error", message: describeError(err) });
        }
      }
    },
    [api, setActive, getSessions, clearUnread],
  );

  const newChat = useCallback(async () => {
    const request = ++selectionRequestRef.current;
    selectionTargetRef.current = null;
    try {
      const created = await api.createSession();
      applySessions([...getSessions(), created]);
      if (request === selectionRequestRef.current) setActive(created, []);
    } catch (err) {
      dispatch({ type: "error", message: describeError(err) });
    }
  }, [api, applySessions, getSessions, setActive]);

  const renameSession = useCallback(
    async (id: string, title: string) => {
      try {
        const updated = await api.renameSession(id, title);
        if (activeRef.current?.id === id) activeRef.current.title = updated.title;
        applySessions(getSessions().map((s) => (s.id === id ? updated : s)));
      } catch (err) {
        dispatch({ type: "error", message: describeError(err) });
      }
    },
    [api, applySessions, getSessions],
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
        dispatch({ type: "error", message: describeError(err) });
      }
    },
    [api, applySessions, getSessions, setActive, forget],
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
      dispatch({ type: "error", message: describeError(err) });
    }
  }, [api, applySessions, getSessions, forget]);

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
              content: "The retry request failed.",
              createdAt: Date.now(),
              error: true,
            };
        dispatch({ type: "routeSettled", results: [result] });
      } catch (err) {
        if (activeRef.current?.id !== originId) return;
        dispatch({ type: "error", message: describeError(err) });
      }
    },
    [api, dispatch],
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

interface ChatPanelBaseProps {
  /** Backend seam; defaults to the no-IPC stub so shell tests stay offline. */
  api?: ChatApi;
  /** Optional controller retained by a shell that may unmount the chat panel. */
  chat?: ChatController;
}

interface RetainedRouteProps {
  /** Route state retained by a shell that may unmount the chat panel. */
  routesBySession: RoutesBySession;
  /** Updates shell-retained route state. */
  setRoutesBySession: Dispatch<SetStateAction<RoutesBySession>>;
}

interface LocalRouteProps {
  routesBySession?: never;
  setRoutesBySession?: never;
}

export type ChatPanelProps = ChatPanelBaseProps & (RetainedRouteProps | LocalRouteProps);
export type ChatController = ReturnType<typeof useChat>;

/**
 * The expanded panel's chat body (SP-006, SP-048–051, SP-017): a collapsible
 * history rail, a toolbar (rail toggle + active chat title + Clear), an ordered
 * transcript with safe Markdown rendering for assistant replies, per-provider
 * blocking ("thinking") slots, inline error cards for failed provider slots
 * (plus a residual error banner for infrastructure/storage failures from the
 * catch path), the prompt composer, and the AI switcher beside Send for choosing
 * a single provider or All. Each settled assistant reply keeps its persisted
 * model+effort badge; user messages are unlabeled.
 */
export function ChatPanel({
  api = inertChatApi,
  chat: retainedChat,
  routesBySession: retainedRoutesBySession,
  setRoutesBySession: setRetainedRoutesBySession,
}: ChatPanelProps) {
  const localChat = useChat(api, !retainedChat);
  const {
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
  } = retainedChat ?? localChat;
  const [draft, setDraft] = useState("");
  const [localRoutesBySession, setLocalRoutesBySession] = useState<RoutesBySession>({});
  const routesBySession = retainedRoutesBySession ?? localRoutesBySession;
  const setRoutesBySession = setRetainedRoutesBySession ?? setLocalRoutesBySession;
  const [railOpen, setRailOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [renamingActive, setRenamingActive] = useState(false);
  const isPending = state.status.kind === "pending";
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // A single clock for the whole transcript render; "today" vs "earlier" only
  // needs day-level accuracy, so a per-render value is fine and stays cheap.
  const now = Date.now();

  // Render assistant-Markdown links so they open in the system browser and never
  // navigate the app's WebView. preventDefault covers primary and middle clicks
  // (and keyboard activation); the Rust side validates the scheme.
  const markdownComponents = useMemo<Components>(
    () => ({
      a({ href, children }) {
        const openExternally = (event: React.MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          if (href) void api.openExternal(href);
        };
        return (
          <a
            href={href}
            rel="noreferrer"
            onClick={openExternally}
            onAuxClick={openExternally}
          >
            {children}
          </a>
        );
      },
    }),
    [api],
  );

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const activeTitle = activeSession?.title?.trim() || "New chat";
  const route = activeSessionId
    ? (routesBySession[activeSessionId] ?? DEFAULT_ROUTE)
    : DEFAULT_ROUTE;
  const canClear = !isPending && state.messages.length > 0;
  // A background reply landed in some non-active chat. Surface it on the toggle
  // while the rail is collapsed, so the in-row dot isn't the only indicator.
  const hasUnread = unreadIds.size > 0;
  const showUnreadBadge = !railOpen && hasUnread;

  // Provider selection belongs to a chat, not the panel. Chats without an
  // explicit selection (including newly created chats) use the GPT default.
  const setActiveRoute = useCallback(
    (next: ActiveRoute) => {
      if (!activeSessionId) return;
      setRoutesBySession((current) => ({ ...current, [activeSessionId]: next }));
    },
    [activeSessionId, setRoutesBySession],
  );

  // Retry button: only the last error message in a single-provider chat where
  // the currently selected AI matches the error's provider gets a Retry button.
  const retryErrorId = useMemo(() => {
    if (route.kind !== "single") return null;
    const lastError = [...state.messages].reverse().find((m) => m.error);
    if (!lastError || lastError.assistantId !== route.provider) return null;
    return lastError.id;
  }, [route, state.messages]);

  const handleRetry = useCallback(
    (errorMessageId: string, provider: string) => {
      // Find the user message immediately before the error.
      const idx = state.messages.findIndex((m) => m.id === errorMessageId);
      if (idx === -1) return;
      let userContent: string | undefined;
      for (let i = idx - 1; i >= 0; i--) {
        if (state.messages[i].sender === "user") {
          userContent = state.messages[i].content;
          break;
        }
      }
      if (!userContent) return;
      void retry(errorMessageId, provider, userContent);
    },
    [state.messages, retry],
  );

  // Drop retained UI state after a chat is deleted.
  useEffect(() => {
    // A remounted panel starts with an empty session list while history loads.
    // Do not mistake that transient state for every chat having been deleted.
    if (sessions.length === 0) return;
    const sessionIds = new Set(sessions.map((session) => session.id));
    if (Object.keys(routesBySession).every((sessionId) => sessionIds.has(sessionId)))
      return;
    setRoutesBySession(
      Object.fromEntries(
        Object.entries(routesBySession).filter(([sessionId]) =>
          sessionIds.has(sessionId),
        ),
      ),
    );
  }, [routesBySession, sessions, setRoutesBySession]);

  // Keep the latest turn in view as the transcript grows. Guarded because
  // `scrollIntoView` is not implemented in the jsdom test environment.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [state.messages.length, state.status.kind]);

  const resizeComposerInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${
      draft
        ? Math.max(COMPOSER_INPUT_MIN_HEIGHT, el.scrollHeight)
        : COMPOSER_INPUT_MIN_HEIGHT
    }px`;
  }, [draft]);

  // Auto-grow the composer from a single row up to the CSS max-height (after
  // which it scrolls). Resetting to "auto" first lets it shrink again as text
  // is deleted or after a submit clears the draft.
  useLayoutEffect(() => {
    resizeComposerInput();
  }, [resizeComposerInput]);

  useEffect(() => {
    window.addEventListener("resize", resizeComposerInput);
    return () => window.removeEventListener("resize", resizeComposerInput);
  }, [resizeComposerInput]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending || !draft.trim()) return;
    void submit(draft, route);
    setDraft("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isPending && draft.trim()) {
        void submit(draft, route);
        setDraft("");
      }
    }
  };

  return (
    <div className="panel__body chat">
      {railOpen && (
        <ChatHistory
          sessions={sessions}
          activeSessionId={activeSessionId}
          pendingIds={pendingIds}
          unreadIds={unreadIds}
          onSelect={(id) => void selectSession(id)}
          onNewChat={() => void newChat()}
          onRename={(id, title) => void renameSession(id, title)}
          onDelete={(id) => void deleteSession(id)}
        />
      )}
      <div className="chat__main">
        <div className="chat__toolbar">
          <button
            type="button"
            className="chat__rail-toggle"
            aria-label={
              railOpen
                ? "Hide chat history"
                : showUnreadBadge
                  ? "Show chat history, unread answers"
                  : "Show chat history"
            }
            aria-expanded={railOpen}
            aria-controls="chat-history-rail"
            onClick={() => setRailOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
            {showUnreadBadge && (
              <span className="chat__rail-toggle-badge" aria-hidden="true" />
            )}
          </button>
          <span className="chat__active-title" title={activeTitle}>
            {activeTitle}
          </span>
          <button
            type="button"
            className="chat__edit"
            aria-label="Rename chat"
            title="Rename chat"
            onClick={() => setRenamingActive(true)}
            disabled={!activeSession}
          >
            {/* Pencil glyph — opens the rename dialog for the active chat. */}
            <span aria-hidden="true">✎</span>
          </button>
          <button
            type="button"
            className="chat__clear"
            aria-label="Clear chat"
            onClick={() => setConfirmingClear(true)}
            disabled={!canClear}
          >
            Clear
          </button>
        </div>

        <div className="conversation" aria-live="polite">
          {state.messages.map((message) => {
            if (message.sender !== "assistant") {
              // User messages carry only a timestamp; bubble alignment marks the
              // sender.
              return (
                <article key={message.id} className="message message--user">
                  <div className="message__meta">
                    <time className="message__time">
                      {formatMessageTimestamp(message.createdAt, now)}
                    </time>
                  </div>
                  <p>{message.content}</p>
                </article>
              );
            }
            const label = messageLabel(
              message.assistantId,
              message.model,
              message.reasoningEffort,
            );
            // A per-provider slot still awaiting its reply (SP-017).
            if (message.pending) {
              return (
                <article
                  key={message.id}
                  className="message message--assistant message--thinking"
                  data-testid="thinking"
                  data-provider={message.assistantId}
                >
                  <span className="message__label">{label}</span>
                  <p className="message__thinking" role="status">
                    Thinking…
                  </p>
                </article>
              );
            }
            // A failed provider slot renders as an inline error card in-thread.
            if (message.error) {
              const showRetry = retryErrorId === message.id;
              return (
                <article
                  key={message.id}
                  className="message message--assistant message--error"
                  data-testid="provider-error"
                  data-provider={message.assistantId}
                >
                  <div className="message__meta">
                    <span className="message__label">{label}</span>
                    <time className="message__time">
                      {formatMessageTimestamp(message.createdAt, now)}
                    </time>
                  </div>
                  <p className="message__error" role="alert">
                    {message.content}
                  </p>
                  {showRetry && (
                    <button
                      type="button"
                      className="message__retry"
                      onClick={() =>
                        void handleRetry(message.id, message.assistantId ?? "")
                      }
                    >
                      Retry
                    </button>
                  )}
                </article>
              );
            }
            return (
              <article key={message.id} className="message message--assistant">
                {/* One-row meta: provider/model label then the timestamp. Kept on
                    a single line (nowrap) so a narrow panel never wraps it. */}
                <div className="message__meta">
                  <span className="message__label">{label}</span>
                  <time className="message__time">
                    {formatMessageTimestamp(message.createdAt, now)}
                  </time>
                </div>
                <div className="message__markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </article>
            );
          })}
          {/* Defensive fallback for a pending session without recoverable
              provider-slot metadata (for example, state from an older client). */}
          {isPending && !state.messages.some((m) => m.pending) && (
            <article
              className="message message--assistant message--thinking"
              data-testid="thinking"
            >
              <p className="message__thinking" role="status">
                Thinking…
              </p>
            </article>
          )}
          <div ref={endRef} />
        </div>
        {state.status.kind === "error" && (
          <p className="conversation__error" role="alert">
            {state.status.message}
          </p>
        )}
        <form className="composer" aria-label="Prompt composer" onSubmit={onSubmit}>
          <textarea
            ref={inputRef}
            className="composer__input"
            aria-label="Ask side-pilot"
            placeholder="Ask side-pilot"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <AiSwitcher route={route} disabled={isPending} onSelect={setActiveRoute} />
          <button
            type="submit"
            className="composer__send"
            aria-label="Send"
            title="Send (Enter)"
            disabled={isPending || !draft.trim()}
          >
            {/* Return/Enter glyph — the Enter key sends. aria-label keeps the
                accessible name "Send" for screen readers. */}
            <span aria-hidden="true">⏎</span>
          </button>
        </form>
      </div>

      {renamingActive && activeSession && (
        <RenameDialog
          session={activeSession}
          onCancel={() => setRenamingActive(false)}
          onSave={(title) => {
            void renameSession(activeSession.id, title);
            setRenamingActive(false);
          }}
        />
      )}

      {confirmingClear && (
        <Dialog label="Clear chat" onClose={() => setConfirmingClear(false)}>
          <div className="dialog__body">
            <p className="dialog__message">
              Clear this chat? All messages in “{activeTitle}” will be permanently deleted
              and this conversation can’t be resumed.
            </p>
            <div className="dialog__actions">
              <button
                type="button"
                className="dialog__button"
                onClick={() => setConfirmingClear(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dialog__button dialog__button--danger"
                onClick={() => {
                  void clearActive();
                  setConfirmingClear(false);
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
