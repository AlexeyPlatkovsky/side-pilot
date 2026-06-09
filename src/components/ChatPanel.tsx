import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { inertChatApi, type ChatApi } from "../chat/api";
import { formatMessageTimestamp } from "../chat/history";
import { DEFAULT_ROUTE, messageLabel, type ActiveRoute } from "../chat/providers";
import { AiSwitcher } from "./AiSwitcher";
import { ChatHistory } from "./ChatHistory";
import { Dialog } from "./Dialog";
import { RenameDialog } from "./RenameDialog";
import {
  COMPOSER_INPUT_MIN_HEIGHT,
  useChat,
  type ChatController,
  type RoutesBySession,
} from "../chat/useChat";
import type { Locale } from "../i18n/types";
import { useI18n } from "../i18n/useI18n";

interface ChatPanelBaseProps {
  /** Backend seam; defaults to the no-IPC stub so shell tests stay offline. */
  api?: ChatApi;
  /** Optional controller retained by a shell that may unmount the chat panel. */
  chat?: ChatController;
  /** Current locale for translations. */
  locale?: Locale;
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
  locale = "en",
}: ChatPanelProps) {
  const { t } = useI18n(locale);
  const localChat = useChat(api, !retainedChat, locale);
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
  const activeTitle = activeSession?.title?.trim() || t("chat_newChatFallback");
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
    if (lastError?.assistantId !== route.provider) return null;
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
          locale={locale}
        />
      )}
      <div className="chat__main">
        <div className="chat__toolbar">
          <button
            type="button"
            className="chat__rail-toggle"
            aria-label={
              railOpen
                ? t("chat_hideHistory")
                : showUnreadBadge
                  ? t("chat_showHistoryUnread")
                  : t("chat_showHistory")
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
            aria-label={t("chat_renameChat")}
            title={t("chat_renameChat")}
            onClick={() => setRenamingActive(true)}
            disabled={!activeSession}
          >
            {/* Pencil glyph — opens the rename dialog for the active chat. */}
            <span aria-hidden="true">✎</span>
          </button>
          <button
            type="button"
            className="chat__clear"
            aria-label={t("chat_clearChat")}
            onClick={() => setConfirmingClear(true)}
            disabled={!canClear}
          >
            {t("chat_clear")}
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
                    {t("chat_thinking")}
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
                      {t("chat_retry")}
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
                {t("chat_thinking")}
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
          aria-label={t("chat_composerLabel")}
          onSubmit={onSubmit}
        >
          <textarea
            ref={inputRef}
            className="composer__input"
            aria-label={t("chat_askLabel")}
            placeholder={t("chat_askPlaceholder")}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <AiSwitcher
            route={route}
            disabled={isPending}
            onSelect={setActiveRoute}
            locale={locale}
          />
          <button
            type="submit"
            className="composer__send"
            aria-label={t("chat_send")}
            title={t("chat_sendTitle")}
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
          locale={locale}
        />
      )}

      {confirmingClear && (
        <Dialog
          label={t("chat_clearChatLabel")}
          onClose={() => setConfirmingClear(false)}
        >
          <div className="dialog__body">
            <p className="dialog__message">
              {t("chat_clearConfirm", { title: activeTitle })}
            </p>
            <div className="dialog__actions">
              <button
                type="button"
                className="dialog__button"
                onClick={() => setConfirmingClear(false)}
              >
                {t("chat_cancel")}
              </button>
              <button
                type="button"
                className="dialog__button dialog__button--danger"
                onClick={() => {
                  void clearActive();
                  setConfirmingClear(false);
                }}
              >
                {t("chat_clear")}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
