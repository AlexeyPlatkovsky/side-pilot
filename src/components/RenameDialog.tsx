import { useEffect, useId, useRef, useState } from "react";
import type { PersistedSession } from "../chat/api";
import { isValidTitle, MAX_TITLE_LENGTH } from "../chat/history";
import { Dialog } from "./Dialog";
import type { Locale } from "../i18n/types";
import { useI18n } from "../i18n/useI18n";

export interface RenameDialogProps {
  /** Session whose title is being edited; its current title prefills the input. */
  session: PersistedSession;
  onCancel: () => void;
  onSave: (title: string) => void;
  /** Current locale for translations. */
  locale?: Locale;
}

/**
 * Modal to rename a chat: prefilled with the current title, Enter saves, Escape
 * cancels, and an invalid title (empty, too long, or containing special
 * symbols) disables Save and shows an inline hint. Shared by the history rail's
 * per-row options menu and the active-chat toolbar's Edit control (SP-050/057),
 * so both entry points enforce the same title rule.
 */
export function RenameDialog({ session, onCancel, onSave, locale = "en" }: RenameDialogProps) {
  const { t } = useI18n(locale);
  const [value, setValue] = useState(session.title ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Unique ids so the rail and toolbar rename dialogs never collide on a shared
  // static id if both mount at once (which would break label/description links).
  const inputId = useId();
  const hintId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const canSave = isValidTitle(value);
  // Only nudge once the user has typed something invalid (not on an empty field).
  const showHint = value.trim().length > 0 && !canSave;

  return (
    <Dialog label={t("rename_label")} onClose={onCancel}>
      <form
        className="dialog__body"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave(value.trim());
        }}
      >
        <label className="dialog__label" htmlFor={inputId}>
          {t("rename_chatTitle")}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          className="dialog__input"
          type="text"
          value={value}
          maxLength={MAX_TITLE_LENGTH}
          aria-invalid={showHint}
          aria-describedby={showHint ? hintId : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {showHint && (
          <p id={hintId} className="dialog__hint" role="alert">
            {t("rename_hint", { max: MAX_TITLE_LENGTH })}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="dialog__button" onClick={onCancel}>
            {t("chat_cancel")}
          </button>
          <button
            type="submit"
            className="dialog__button dialog__button--primary"
            disabled={!canSave}
          >
            {t("rename_save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
