/**
 * Transient, auto-dismissing toast (SP-072).
 *
 * A small status message that disappears on its own after a fixed delay. The
 * 3-second auto-dismiss is the project-wide default (see `docs/design-book.md`).
 * Rendered as an `aria-live` status region so screen readers announce it without
 * stealing focus.
 */

import { useEffect } from "react";

/** Project-wide default toast lifetime, in milliseconds. */
export const TOAST_DURATION_MS = 3000;

export interface ToastProps {
  /** The message to announce. */
  message: string;
  /** Called once the toast has lived out its duration. */
  onDismiss: () => void;
  /** Override the auto-dismiss delay (defaults to {@link TOAST_DURATION_MS}). */
  durationMs?: number;
}

export function Toast({
  message,
  onDismiss,
  durationMs = TOAST_DURATION_MS,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
