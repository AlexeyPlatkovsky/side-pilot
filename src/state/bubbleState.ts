/**
 * Pure state machine for the floating bubble window (SP-004, SP-030).
 *
 * The bubble has three visual modes: a compact always-on-top dot (`collapsed`),
 * the expanded chat panel (`expanded`), and the in-panel settings view
 * (`settings`). Keeping the transitions in a pure reducer lets us unit-test the
 * behavior without a running Tauri window; the actual OS-window resize lives in
 * `windowResize.ts`.
 */

export type BubbleState = "collapsed" | "expanded" | "settings";

export type BubbleAction =
  | "toggle"
  | "expand"
  | "collapse"
  | "openSettings"
  | "closeSettings"
  | "escape";

export interface WindowSize {
  width: number;
  height: number;
}

/** Logical size of the compact bubble dot. */
export const COLLAPSED_SIZE: WindowSize = { width: 64, height: 64 };

/** Logical size of the expanded chat panel. */
export const EXPANDED_SIZE: WindowSize = { width: 380, height: 520 };

/**
 * Logical size of the settings view. Settings is an in-panel sub-view, not a
 * separate window, so it shares the expanded panel's size — opening it must not
 * resize the window away from the main panel.
 */
export const SETTINGS_SIZE: WindowSize = EXPANDED_SIZE;

export function bubbleReducer(state: BubbleState, action: BubbleAction): BubbleState {
  switch (action) {
    case "expand":
      return "expanded";
    case "collapse":
      return "collapsed";
    case "toggle":
      return state === "collapsed" ? "expanded" : "collapsed";
    case "openSettings":
      // The gear only exists on the expanded panel; opening settings from the
      // collapsed bubble is a no-op so the state machine stays well-defined.
      return state === "collapsed" ? "collapsed" : "settings";
    case "closeSettings":
      return state === "settings" ? "expanded" : state;
    case "escape":
      // Escape steps back one level: settings -> panel, panel -> bubble.
      return state === "settings" ? "expanded" : "collapsed";
  }
}

export function sizeFor(state: BubbleState): WindowSize {
  switch (state) {
    case "expanded":
      return EXPANDED_SIZE;
    case "settings":
      return SETTINGS_SIZE;
    case "collapsed":
      return COLLAPSED_SIZE;
  }
}
