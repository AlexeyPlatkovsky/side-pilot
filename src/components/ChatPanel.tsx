import {
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
import {
  chatReducer,
  initialChatState,
  type ChatMessage,
} from "../state/chat";
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
import { ASSISTANT_MODEL, assistantModelLabel } from "../chat/config";
import { ChatHistory } from "./ChatHistory";
import { Dialog } from "./Dialog";
import { RenameDialog } from "./RenameDialog";

const COMPOSER_INPUT_MIN_HEIGHT = 32;

/** Shared empty status set so unchanged renders keep a stable identity. */
const EMPTY_IDS: ReadonlySet<string> = new Set();

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

/**
 * Chat logic hook (SP-006, SP-048–051). Owns the transcript reducer plus the
 * session list and the active session, and wires every chat operation through
 * the injected [`ChatApi`]: prompt submission (persist user turn, run the
 * blocking Codex call, persist + display the reply, record the native resume
 * id, and title an untitled chat from its first prompt), session switching,
 * new/rename/delete, and clear. The local store is the display source of truth,
 * so the transcript and list are (re)loaded from it.
 */
export function useChat(api: ChatApi) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [sessions, setSessions] = useState<PersistedSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Per-session status for the rail (SP-056): chats with a reply in flight, and
  // chats whose reply arrived while they were not the active chat (unread).
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const [unreadIds, setUnreadIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  // Refs mirror the latest list/active session and status sets so the async
  // callbacks below read current values without stale closures.
  const sessionsRef = useRef<PersistedSession[]>([]);
  const activeRef = useRef<ActiveSession | null>(null);
  const pendingRef = useRef<ReadonlySet<string>>(EMPTY_IDS);
  const unreadRef = useRef<ReadonlySet<string>>(EMPTY_IDS);

  // Update a status set through its ref+state together (immutable copy so React
  // sees a new identity). `mutate` adds/removes ids on the working copy.
  const editSet = useCallback(
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

  const applySessions = useCallback((list: PersistedSession[]) => {
    const sorted = sortSessions(list);
    sessionsRef.current = sorted;
    setSessions(sorted);
  }, []);

  const refresh = useCallback(async () => {
    applySessions(await api.listSessions());
  }, [api, applySessions]);

  const setActive = useCallback(
    (session: PersistedSession, messages: ChatMessage[]) => {
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
        messages,
        pending: pendingRef.current.has(session.id),
      });
    },
    [],
  );

  useEffect(() => {
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
  }, [api, applySessions, setActive]);

  const submit = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      const session = activeRef.current;
      if (!trimmed || !session) return;
      // The chat this turn belongs to. A blocking reply can take seconds, during
      // which the user may switch to another chat; the late reply must land in
      // (and only re-render) its originating chat, never whichever is now active.
      const originId = session.id;

      const userMessage: ChatMessage = {
        id: newId(),
        sender: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      // Show the user's message immediately and enter the pending state, and
      // mark this chat in-flight so the rail shows a spinner (SP-056).
      dispatch({ type: "submit", message: userMessage });
      editSet(pendingRef, setPendingIds, (s) => s.add(originId));

      try {
        // Persist the user turn first so it survives a failed/late reply.
        await api.appendMessage({
          sessionId: session.id,
          sender: "user",
          content: trimmed,
        });
        // Name a still-untitled chat from its first prompt (SP-049).
        if (!session.title || !session.title.trim()) {
          const generated = generateTitle(trimmed);
          if (generated) {
            const updated = await api.renameSession(session.id, generated);
            session.title = updated.title;
          }
        }
        const result = await api.runAdapter({
          assistant: "codex",
          prompt: trimmed,
          model: ASSISTANT_MODEL.id,
          reasoningEffort: ASSISTANT_MODEL.effort,
          resumeSessionId: session.codexSessionId ?? undefined,
        });
        const persisted = await api.appendMessage({
          sessionId: session.id,
          sender: "assistant",
          assistantId: "codex",
          content: result.assistantText,
          rawJson: result.rawJson,
        });
        // This turn is no longer in flight.
        editSet(pendingRef, setPendingIds, (s) => s.delete(originId));
        if (activeRef.current?.id === originId) {
          // Still viewing this chat — show the reply.
          dispatch({ type: "success", message: toChatMessage(persisted) });
        } else if (sessionsRef.current.some((s) => s.id === originId)) {
          // Replied in the background — flag it unread until the user opens it.
          // Skip if the chat was deleted meanwhile, so no phantom dot lingers.
          editSet(unreadRef, setUnreadIds, (s) => s.add(originId));
        }

        // Capture the native Codex session for future resume (§6).
        const native = result.nativeSessionId;
        if (native && session.codexSessionId !== native) {
          session.codexSessionId = native;
          await api.updateCodexSessionId(session.id, native);
        }
      } catch (err) {
        editSet(pendingRef, setPendingIds, (s) => s.delete(originId));
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
    [api, refresh, editSet],
  );

  const selectSession = useCallback(
    async (id: string) => {
      if (activeRef.current?.id === id) return;
      const session = sessionsRef.current.find((s) => s.id === id);
      if (!session) return;
      // Opening a chat clears its unread flag (SP-056).
      editSet(unreadRef, setUnreadIds, (s) => s.delete(id));
      try {
        const history = await api.readHistory(id);
        setActive(session, history.map(toChatMessage));
      } catch (err) {
        dispatch({ type: "error", message: describeError(err) });
      }
    },
    [api, setActive, editSet],
  );

  const newChat = useCallback(async () => {
    try {
      const created = await api.createSession();
      applySessions([...sessionsRef.current, created]);
      setActive(created, []);
    } catch (err) {
      dispatch({ type: "error", message: describeError(err) });
    }
  }, [api, applySessions, setActive]);

  const renameSession = useCallback(
    async (id: string, title: string) => {
      try {
        const updated = await api.renameSession(id, title);
        if (activeRef.current?.id === id) activeRef.current.title = updated.title;
        applySessions(
          sessionsRef.current.map((s) => (s.id === id ? updated : s)),
        );
      } catch (err) {
        dispatch({ type: "error", message: describeError(err) });
      }
    },
    [api, applySessions],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      const wasActive = activeRef.current?.id === id;
      const nextId = pickNextActiveSession(sessionsRef.current, id);
      try {
        await api.deleteSession(id);
        // The chat is gone — drop any in-flight/unread status it held so the
        // sets don't leak ids for a session that no longer exists.
        editSet(pendingRef, setPendingIds, (s) => s.delete(id));
        editSet(unreadRef, setUnreadIds, (s) => s.delete(id));
        const remaining = sessionsRef.current.filter((s) => s.id !== id);
        if (!wasActive) {
          applySessions(remaining);
          return;
        }
        if (nextId) {
          const next = remaining.find((s) => s.id === nextId)!;
          applySessions(remaining);
          const history = await api.readHistory(nextId);
          setActive(next, history.map(toChatMessage));
        } else {
          // No chats remain — start a fresh empty one (session model).
          const created = await api.createSession();
          applySessions([created]);
          setActive(created, []);
        }
      } catch (err) {
        dispatch({ type: "error", message: describeError(err) });
      }
    },
    [api, applySessions, setActive, editSet],
  );

  const clearActive = useCallback(async () => {
    const session = activeRef.current;
    if (!session) return;
    try {
      const cleared = await api.clearSession(session.id);
      session.codexSessionId = null;
      session.title = cleared.title;
      // A cleared chat is emptied, so it carries no in-flight/unread status.
      editSet(pendingRef, setPendingIds, (s) => s.delete(cleared.id));
      editSet(unreadRef, setUnreadIds, (s) => s.delete(cleared.id));
      dispatch({ type: "loaded", messages: [] });
      applySessions(
        sessionsRef.current.map((s) => (s.id === cleared.id ? cleared : s)),
      );
    } catch (err) {
      dispatch({ type: "error", message: describeError(err) });
    }
  }, [api, applySessions, editSet]);

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
  };
}

export interface ChatPanelProps {
  /** Backend seam; defaults to the no-IPC stub so shell tests stay offline. */
  api?: ChatApi;
}

/**
 * The expanded panel's chat body (SP-006, SP-048–051): a collapsible history
 * rail, a toolbar (rail toggle + active chat title + Clear), an ordered
 * transcript with safe Markdown rendering for assistant replies, a visible
 * blocking ("thinking") state, an error banner that keeps the user's message,
 * and the prompt composer. Each assistant reply is badged with the model and
 * reasoning effort (e.g. "GPT-5.5-medium"); user messages are unlabeled.
 */
export function ChatPanel({ api = inertChatApi }: ChatPanelProps) {
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
  } = useChat(api);
  const [draft, setDraft] = useState("");
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
  const canClear = !isPending && state.messages.length > 0;
  // A background reply landed in some non-active chat. Surface it on the toggle
  // while the rail is collapsed, so the in-row dot isn't the only indicator.
  const hasUnread = unreadIds.size > 0;
  const showUnreadBadge = !railOpen && hasUnread;

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
    void submit(draft);
    setDraft("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isPending && draft.trim()) {
        void submit(draft);
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
          {state.messages.map((message) =>
            message.sender === "assistant" ? (
              <article key={message.id} className="message message--assistant">
                {/* One-row meta: model+effort badge then the timestamp. Kept on a
                    single line (nowrap) so a narrow panel never wraps it. */}
                <div className="message__meta">
                  <span className="message__label">{assistantModelLabel}</span>
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
            ) : (
              // User messages carry only a timestamp; bubble alignment marks the
              // sender.
              <article key={message.id} className="message message--user">
                <div className="message__meta">
                  <time className="message__time">
                    {formatMessageTimestamp(message.createdAt, now)}
                  </time>
                </div>
                <p>{message.content}</p>
              </article>
            ),
          )}
          {isPending && (
            <article
              className="message message--assistant message--thinking"
              data-testid="thinking"
            >
              <span className="message__label">{assistantModelLabel}</span>
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
        <form
          className="composer"
          aria-label="Prompt composer"
          onSubmit={onSubmit}
        >
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
              Clear this chat? All messages in “{activeTitle}” will be
              permanently deleted and this conversation can’t be resumed.
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
