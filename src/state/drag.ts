/**
 * Click-vs-drag discrimination for the floating bubble.
 *
 * The collapsed bubble is both a window drag handle (`data-tauri-drag-region`)
 * and a click target that expands the panel. After dragging the window, the
 * webview still emits a `click`, which would spuriously expand the panel. We
 * tell the two apart by comparing the pointer's **screen** position between
 * pointer-down and click: during a window drag the cursor travels across the
 * screen (the window follows it), so the delta exceeds a small threshold; a
 * genuine click barely moves.
 */

import { useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

export interface Point {
  x: number;
  y: number;
}

/** Movement beyond this many screen pixels counts as a drag, not a click. */
export const DRAG_THRESHOLD_PX = 4;

export function wasDragged(
  start: Point,
  end: Point,
  threshold: number = DRAG_THRESHOLD_PX,
): boolean {
  return Math.abs(end.x - start.x) > threshold || Math.abs(end.y - start.y) > threshold;
}

/** Mouse handlers to spread onto a control that is both a click target and a
 * `data-tauri-drag-region` window-drag handle. */
export interface ClickVsDragHandlers {
  onMouseDown: (event: ReactMouseEvent) => void;
  onClick: (event: ReactMouseEvent) => void;
}

/**
 * Runs `action` only on a genuine click, suppressing the synthetic `click` that
 * follows a window drag. Records the press origin on mouse-down and compares it
 * to the release position with {@link wasDragged}; a press that moved beyond the
 * threshold is treated as a drag and swallowed. A click with no recorded origin
 * counts as a click (the conservative default the bubble relied on before).
 *
 * Shared by the collapsed dot (expand) and the panel mark (collapse) so the two
 * click-vs-drag controls cannot drift apart.
 */
export function useClickVsDrag(action: () => void): ClickVsDragHandlers {
  const pressOrigin = useRef<Point | null>(null);
  return {
    onMouseDown: (event) => {
      pressOrigin.current = { x: event.screenX, y: event.screenY };
    },
    onClick: (event) => {
      const origin = pressOrigin.current;
      pressOrigin.current = null;
      if (origin && wasDragged(origin, { x: event.screenX, y: event.screenY })) {
        return;
      }
      action();
    },
  };
}
