import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
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
  generateTitle,
  pickNextActiveSession,
  sortSessions,
} from "../chat/history";
import { ASSISTANT_MODEL, assistantModelLabel } from "../chat/config";
import { ChatHistory } from "./ChatHistory";
import { Dialog } from "./Dialog";

const COMPOSER_INPUT_MIN_HEIGHT = 32;

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
  // Refs mirror the latest list/active session so the async callbacks below read
  // current values without being re-created (and without stale closures).
  const sessionsRef = useRef<PersistedSession[]>([]);
  const activeRef = useRef<ActiveSession | null>(null);

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
      dispatch({ type: "loaded", messages });
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
      };
      // Show the user's message immediately and enter the pending state.
      dispatch({ type: "submit", message: userMessage });

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
        // Only re-render the transcript if this chat is still the active one;
        // the reply is persisted either way and loads when the user returns.
        if (activeRef.current?.id === originId) {
          dispatch({ type: "success", message: toChatMessage(persisted) });
        }

        // Capture the native Codex session for future resume (§6).
        const native = result.nativeSessionId;
        if (native && session.codexSessionId !== native) {
          session.codexSessionId = native;
          await api.updateCodexSessionId(session.id, native);
        }
      } catch (err) {
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
    [api, refresh],
  );

  const selectSession = useCallback(
    async (id: string) => {
      if (activeRef.current?.id === id) return;
      const session = sessionsRef.current.find((s) => s.id === id);
      if (!session) return;
      try {
        const history = await api.readHistory(id);
        setActive(session, history.map(toChatMessage));
      } catch (err) {
        dispatch({ type: "error", message: describeError(err) });
      }
    },
    [api, setActive],
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
    [api, applySessions, setActive],
  );

  const clearActive = useCallback(async () => {
    const session = activeRef.current;
    if (!session) return;
    try {
      const cleared = await api.clearSession(session.id);
      session.codexSessionId = null;
      session.title = cleared.title;
      dispatch({ type: "loaded", messages: [] });
      applySessions(
        sessionsRef.current.map((s) => (s.id === cleared.id ? cleared : s)),
      );
    } catch (err) {
      dispatch({ type: "error", message: describeError(err) });
    }
  }, [api, applySessions]);

  return {
    state,
    sessions,
    activeSessionId,
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
  const isPending = state.status.kind === "pending";
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const activeTitle = activeSession?.title?.trim() || "New chat";
  const canClear = !isPending && state.messages.length > 0;

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
            aria-label={railOpen ? "Hide chat history" : "Show chat history"}
            aria-expanded={railOpen}
            aria-controls="chat-history-rail"
            onClick={() => setRailOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <span className="chat__active-title" title={activeTitle}>
            {activeTitle}
          </span>
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
                {/* Badge shows which model + effort produced the reply. */}
                <span className="message__label">{assistantModelLabel}</span>
                <div className="message__markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              </article>
            ) : (
              // User messages carry no label — the bubble alignment is enough.
              <article key={message.id} className="message message--user">
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
