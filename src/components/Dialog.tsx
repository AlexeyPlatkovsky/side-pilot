import { useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  /** Visible heading and accessible name (via `aria-labelledby`). */
  label: string;
  /** Escape, overlay focus loss, or a Cancel control should call this. */
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Shared modal chrome for the chat dialogs (rename / delete / clear). Provides
 * `role="dialog"` + `aria-modal` semantics, a focus trap, initial focus on the
 * first focusable control, Escape-to-close, and focus restoration to the
 * invoking control on unmount — the accessibility contract a bare overlay
 * `div` could not satisfy.
 */
export function Dialog({ label, onClose, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const root = overlayRef.current;
    if (!root) return;
    // Remember the control that opened the dialog so focus can return there.
    // This effect runs before any descendant's focus effect (React fires child
    // effects deepest-first, and Dialog is deeper than the dialog wrappers that
    // own inputs), so activeElement here is still the opener (e.g. the row `⋯`
    // trigger) — not a not-yet-focused child input.
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Move focus into the dialog unless something already claimed it.
    if (!root.contains(document.activeElement)) {
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? root).focus();
    }
    return () => {
      restoreRef.current?.focus?.();
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const root = overlayRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    // Cycle focus so Tab never escapes the modal to the rail/transcript behind.
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={overlayRef}
      className="dialog__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="dialog">
        <h2 id={titleId} className="dialog__title">
          {label}
        </h2>
        {children}
      </div>
    </div>
  );
}
