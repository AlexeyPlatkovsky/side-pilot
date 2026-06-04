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
} from "../chat/api";
import { ASSISTANT_MODEL, assistantModelLabel } from "../chat/config";

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
}

/**
 * Chat logic hook (SP-006). Owns the transcript reducer and the active session,
 * and wires prompt submission through the injected [`ChatApi`]: persist the
 * user turn, run the blocking Codex call, persist + display the reply, and
 * record the native Codex session id for resume (§6). The local store is the
 * display source of truth, so the transcript is reloaded from it on mount.
 */
export function useChat(api: ChatApi) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const sessionRef = useRef<ActiveSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessions = await api.listSessions();
        const session = sessions[0] ?? (await api.createSession());
        const history = await api.readHistory(session.id);
        if (cancelled) return;
        sessionRef.current = {
          id: session.id,
          codexSessionId: session.codexSessionId,
        };
        dispatch({ type: "loaded", messages: history.map(toChatMessage) });
      } catch (err) {
        if (!cancelled) dispatch({ type: "error", message: describeError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const submit = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      const session = sessionRef.current;
      if (!trimmed || !session) return;

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
        dispatch({ type: "success", message: toChatMessage(persisted) });

        // Capture the native Codex session for future resume (§6).
        const native = result.nativeSessionId;
        if (native && session.codexSessionId !== native) {
          session.codexSessionId = native;
          await api.updateCodexSessionId(session.id, native);
        }
      } catch (err) {
        dispatch({ type: "error", message: describeError(err) });
      }
    },
    [api],
  );

  return { state, submit };
}

export interface ChatPanelProps {
  /** Backend seam; defaults to the no-IPC stub so shell tests stay offline. */
  api?: ChatApi;
}

/**
 * The expanded panel's chat body (SP-006): an ordered transcript with safe
 * Markdown rendering for assistant replies, a visible blocking ("thinking")
 * state, an error banner that keeps the user's message, and the prompt
 * composer. Each assistant reply is badged with the model and reasoning effort
 * (e.g. "GPT-5.5-medium"); user messages are unlabeled.
 */
export function ChatPanel({ api = inertChatApi }: ChatPanelProps) {
  const { state, submit } = useChat(api);
  const [draft, setDraft] = useState("");
  const isPending = state.status.kind === "pending";
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
    <div className="panel__body">
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
  );
}
