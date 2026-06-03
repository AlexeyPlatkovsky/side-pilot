/**
 * Pure state machine for the floating bubble window (SP-004).
 *
 * The bubble has two visual modes: a compact always-on-top dot (`collapsed`)
 * and the expanded chat panel (`expanded`). Keeping the transitions in a pure
 * reducer lets us unit-test the behavior without a running Tauri window; the
 * actual OS-window resize lives in `windowResize.ts`.
 */

export type BubbleState = "collapsed" | "expanded";

export type BubbleAction = "toggle" | "expand" | "collapse";

export interface WindowSize {
  width: number;
  height: number;
}

/** Logical size of the compact bubble dot. */
export const COLLAPSED_SIZE: WindowSize = { width: 64, height: 64 };

/** Logical size of the expanded chat panel. */
export const EXPANDED_SIZE: WindowSize = { width: 380, height: 520 };

export function bubbleReducer(
  state: BubbleState,
  action: BubbleAction,
): BubbleState {
  switch (action) {
    case "expand":
      return "expanded";
    case "collapse":
      return "collapsed";
    case "toggle":
      return state === "collapsed" ? "expanded" : "collapsed";
  }
}

export function sizeFor(state: BubbleState): WindowSize {
  return state === "expanded" ? EXPANDED_SIZE : COLLAPSED_SIZE;
}
