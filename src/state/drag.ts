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
  return (
    Math.abs(end.x - start.x) > threshold ||
    Math.abs(end.y - start.y) > threshold
  );
}
