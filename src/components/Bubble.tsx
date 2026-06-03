import { useEffect, useReducer } from "react";
import { bubbleReducer, type BubbleState } from "../state/bubbleState";
import { applyWindowSize } from "../state/windowResize";

export interface BubbleProps {
  /** Initial visual state. Defaults to the compact bubble. */
  initialState?: BubbleState;
  /**
   * Resizes the OS window for a given state. Injectable so tests can run
   * without a live Tauri window; defaults to the real Tauri resize.
   */
  resizeWindow?: (state: BubbleState) => void;
}

/**
 * The floating bubble (SP-004): a compact always-on-top dot that expands into
 * the chat panel on click and collapses on Escape or the close control. The
 * actual chat UI is delivered later (SP-006); this owns only the shell shape
 * and the window-size transitions.
 */
export function Bubble({
  initialState = "collapsed",
  resizeWindow = applyWindowSize,
}: BubbleProps) {
  const [state, dispatch] = useReducer(bubbleReducer, initialState);

  useEffect(() => {
    resizeWindow(state);
  }, [state, resizeWindow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch("collapse");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (state === "collapsed") {
    return (
      <div className="bubble bubble--collapsed">
        <button
          type="button"
          className="bubble__dot"
          aria-label="Open side-pilot"
          data-tauri-drag-region
          onClick={() => dispatch("expand")}
        >
          ◎
        </button>
      </div>
    );
  }

  return (
    <div className="bubble bubble--expanded">
      <section className="panel" data-testid="panel">
        <header className="panel__header" data-tauri-drag-region>
          <span className="panel__title">side-pilot</span>
          <button
            type="button"
            className="panel__close"
            aria-label="Collapse"
            onClick={() => dispatch("collapse")}
          >
            ×
          </button>
        </header>
        <div className="panel__body">
          {/* Chat panel components land in SP-006. */}
          <p className="panel__placeholder">Chat panel coming soon.</p>
        </div>
      </section>
    </div>
  );
}
