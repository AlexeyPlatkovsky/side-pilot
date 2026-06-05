import { useCallback, useEffect, useRef, useState } from "react";
import type { PersistedSession } from "../chat/api";
import { formatRelativeTime, isValidTitle, MAX_TITLE_LENGTH } from "../chat/history";
import { Dialog } from "./Dialog";

export interface ChatHistoryProps {
  /** Sessions in display order (most recently updated first). */
  sessions: PersistedSession[];
  /** The currently open chat, marked `aria-current` in the list. */
  activeSessionId: string | null;
  /** Injectable clock so relative times are deterministic in tests. */
  now?: number;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
  onRename: (sessionId: string, title: string) => void;
  onDelete: (sessionId: string) => void;
}

const UNTITLED = "Untitled chat";

function displayTitle(session: PersistedSession): string {
  const trimmed = session.title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNTITLED;
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
  onSelect,
  onNewChat,
  onRename,
  onDelete,
}: ChatHistoryProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<PersistedSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PersistedSession | null>(null);

  const closeMenu = useCallback(() => setMenuOpenId(null), []);

  return (
    <aside id="chat-history-rail" className="chat-rail" aria-label="Chat history">
      <button
        type="button"
        className="chat-rail__new"
        onClick={onNewChat}
      >
        New chat
      </button>
      <ul className="chat-rail__list">
        {sessions.map((session) => {
          const title = displayTitle(session);
          const active = session.id === activeSessionId;
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
                aria-label={title}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(session.id)}
              >
                <span className="chat-row__title">{title}</span>
                <span className="chat-row__time" aria-hidden="true">
                  {formatRelativeTime(session.updatedAt, now)}
                </span>
              </button>
              <button
                type="button"
                className="chat-row__menu"
                aria-label={`Options for ${title}`}
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
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          title={displayTitle(deleteTarget)}
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
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/** Small per-row options popup; closes on Escape or outside click. */
function RowMenu({ id, onClose, onRename, onDelete }: RowMenuProps) {
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
      <button type="button" role="menuitem" className="chat-row__option" onClick={onRename}>
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        className="chat-row__option chat-row__option--danger"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

interface RenameDialogProps {
  session: PersistedSession;
  onCancel: () => void;
  onSave: (title: string) => void;
}

/** Modal to rename a chat: prefilled, Enter saves, Escape cancels, invalid blocked. */
function RenameDialog({ session, onCancel, onSave }: RenameDialogProps) {
  const [value, setValue] = useState(session.title ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const canSave = isValidTitle(value);
  // Only nudge once the user has typed something invalid (not on an empty field).
  const showHint = value.trim().length > 0 && !canSave;

  return (
    <Dialog label="Rename chat" onClose={onCancel}>
      <form
        className="dialog__body"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave(value.trim());
        }}
      >
        <label className="dialog__label" htmlFor="rename-chat-input">
          Chat title
        </label>
        <input
          id="rename-chat-input"
          ref={inputRef}
          className="dialog__input"
          type="text"
          value={value}
          maxLength={MAX_TITLE_LENGTH}
          aria-invalid={showHint}
          aria-describedby={showHint ? "rename-chat-hint" : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {showHint && (
          <p id="rename-chat-hint" className="dialog__hint" role="alert">
            Use letters, digits, spaces, and basic punctuation
            (’ . , - ( )), up to {MAX_TITLE_LENGTH} characters.
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="dialog__button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="dialog__button dialog__button--primary"
            disabled={!canSave}
          >
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

interface DeleteDialogProps {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation modal before a destructive cascade delete. */
function DeleteDialog({ title, onCancel, onConfirm }: DeleteDialogProps) {
  return (
    <Dialog label="Delete chat" onClose={onCancel}>
      <div className="dialog__body">
        <p className="dialog__message">
          Delete this chat and all messages? “{title}” and its history can’t be
          recovered.
        </p>
        <div className="dialog__actions">
          <button type="button" className="dialog__button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog__button dialog__button--danger"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </Dialog>
  );
}
