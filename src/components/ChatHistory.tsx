import { useCallback, useEffect, useRef, useState } from "react";
import type { PersistedSession } from "../chat/api";
import { formatRelativeTime } from "../chat/history";
import { Dialog } from "./Dialog";
import { RenameDialog } from "./RenameDialog";
import type { Locale } from "../i18n/types";
import { useI18n } from "../i18n/useI18n";

const EMPTY_IDS: ReadonlySet<string> = new Set();

export interface ChatHistoryProps {
  /** Sessions in display order (most recently updated first). */
  sessions: PersistedSession[];
  /** The currently open chat, marked `aria-current` in the list. */
  activeSessionId: string | null;
  /** Injectable clock so relative times are deterministic in tests. */
  now?: number;
  /** Sessions with an AI reply in flight — show a spinner instead of the time. */
  pendingIds?: ReadonlySet<string>;
  /** Sessions with a reply that arrived while inactive — show an unread dot. */
  unreadIds?: ReadonlySet<string>;
  /** Current locale for translations. */
  locale?: Locale;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
  onRename: (sessionId: string, title: string) => void;
  onDelete: (sessionId: string) => void;
}

/**
 * The chat history rail (SP-048/049/050): a "New chat" control plus one compact
 * row per session. Each row selects on click, shows a single-line title and a
 * relative update time, and exposes Rename/Delete only through a per-row options
 * menu (mouse click or right-click). Rename and Delete each open a small modal;
 * the storage effects live in the parent hook via the callbacks.
 */
export function ChatHistory({
  sessions,
  activeSessionId,
  now = Date.now(),
  pendingIds = EMPTY_IDS,
  unreadIds = EMPTY_IDS,
  locale = "en",
  onSelect,
  onNewChat,
  onRename,
  onDelete,
}: ChatHistoryProps) {
  const { t } = useI18n(locale);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<PersistedSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PersistedSession | null>(null);

  const UNTITLED = t("history_untitled");
  const displayTitle = useCallback(
    (session: PersistedSession): string => {
      const trimmed = session.title?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : UNTITLED;
    },
    [UNTITLED],
  );

  const closeMenu = useCallback(() => setMenuOpenId(null), []);

  return (
    <aside id="chat-history-rail" className="chat-rail" aria-label={t("history_label")}>
      <button type="button" className="chat-rail__new" onClick={onNewChat}>
        {t("chat_newChat")}
      </button>
      <ul className="chat-rail__list">
        {sessions.map((session) => {
          const title = displayTitle(session);
          const active = session.id === activeSessionId;
          const pending = pendingIds.has(session.id);
          // A pending reply takes precedence over an unread one (it's the live
          // state); unread only shows once the reply has actually arrived.
          const unread = !pending && unreadIds.has(session.id);
          const statusLabel = pending
            ? t("history_replyInProgress")
            : unread
              ? t("history_unreadAnswer")
              : null;
          return (
            <li
              key={session.id}
              className={`chat-row${active ? " chat-row--active" : ""}`}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenuOpenId(session.id);
              }}
            >
              <button
                type="button"
                className="chat-row__select"
                // Fold the status into the accessible name so it is announced
                // (the visual indicator itself is aria-hidden).
                aria-label={statusLabel ? `${title}, ${statusLabel}` : title}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(session.id)}
              >
                <span className="chat-row__title">{title}</span>
                {pending ? (
                  <span className="chat-row__spinner" aria-hidden="true" />
                ) : unread ? (
                  <span className="chat-row__unread" aria-hidden="true" />
                ) : (
                  <span className="chat-row__time" aria-hidden="true">
                    {formatRelativeTime(session.updatedAt, now)}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="chat-row__menu"
                aria-label={t("history_optionsFor", { title })}
                aria-haspopup="menu"
                aria-expanded={menuOpenId === session.id}
                aria-controls={
                  menuOpenId === session.id ? `chat-row-menu-${session.id}` : undefined
                }
                onClick={() =>
                  setMenuOpenId((open) => (open === session.id ? null : session.id))
                }
              >
                <span aria-hidden="true">⋯</span>
              </button>
              {menuOpenId === session.id && (
                <RowMenu
                  id={`chat-row-menu-${session.id}`}
                  renameLabel={t("history_rename")}
                  deleteLabel={t("history_delete")}
                  onClose={closeMenu}
                  onRename={() => {
                    closeMenu();
                    setRenameTarget(session);
                  }}
                  onDelete={() => {
                    closeMenu();
                    setDeleteTarget(session);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>

      {renameTarget && (
        <RenameDialog
          session={renameTarget}
          onCancel={() => setRenameTarget(null)}
          onSave={(value) => {
            onRename(renameTarget.id, value);
            setRenameTarget(null);
          }}
          locale={locale}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          cancelLabel={t("chat_cancel")}
          deleteLabel={t("history_delete")}
          dialogLabel={t("history_deleteLabel")}
          message={t("history_deleteConfirm", { title: displayTitle(deleteTarget) })}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDelete(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </aside>
  );
}

interface RowMenuProps {
  id: string;
  renameLabel: string;
  deleteLabel: string;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/** Small per-row options popup; closes on Escape or outside click. */
function RowMenu({
  id,
  renameLabel,
  deleteLabel,
  onClose,
  onRename,
  onDelete,
}: RowMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Remember the control that opened the menu (the row's `⋯` trigger) so
    // focus can return there when the menu closes, instead of dropping to body.
    const opener = document.activeElement as HTMLElement | null;
    // Move keyboard focus into the menu so it is operable without the mouse.
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      // Restore focus to the trigger. When a dialog opens next it captures this
      // as its own restore target, so focus ultimately returns to the row.
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div ref={ref} id={id} className="chat-row__options" role="menu">
      <button
        type="button"
        role="menuitem"
        className="chat-row__option"
        onClick={onRename}
      >
        {renameLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className="chat-row__option chat-row__option--danger"
        onClick={onDelete}
      >
        {deleteLabel}
      </button>
    </div>
  );
}

interface DeleteDialogProps {
  cancelLabel: string;
  deleteLabel: string;
  dialogLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation modal before a destructive cascade delete. */
function DeleteDialog({
  cancelLabel,
  deleteLabel,
  dialogLabel,
  message,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <Dialog label={dialogLabel} onClose={onCancel}>
      <div className="dialog__body">
        <p className="dialog__message">{message}</p>
        <div className="dialog__actions">
          <button type="button" className="dialog__button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="dialog__button dialog__button--danger"
            onClick={onConfirm}
          >
            {deleteLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
