import { useEffect, useReducer, useRef } from "react";
import { bubbleReducer, type BubbleState } from "../state/bubbleState";
import { applyWindowSize } from "../state/windowResize";
import { wasDragged, type Point } from "../state/drag";

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

  // Screen position where the press started, used to tell a click apart from a
  // window drag so dragging the bubble doesn't spuriously expand it.
  const pressOrigin = useRef<Point | null>(null);

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
    const onMouseDown = (event: React.MouseEvent) => {
      pressOrigin.current = { x: event.screenX, y: event.screenY };
    };

    const onClick = (event: React.MouseEvent) => {
      const origin = pressOrigin.current;
      pressOrigin.current = null;
      // A click that ended far from where it began was a window drag — ignore it.
      if (origin && wasDragged(origin, { x: event.screenX, y: event.screenY })) {
        return;
      }
      dispatch("expand");
    };

    return (
      <div className="bubble bubble--collapsed">
        <button
          type="button"
          className="bubble__dot"
          aria-label="Open side-pilot"
          data-tauri-drag-region
          onMouseDown={onMouseDown}
          onClick={onClick}
        >
          sp
        </button>
      </div>
    );
  }

  return (
    <div className="bubble bubble--expanded">
      <section className="panel" data-testid="panel">
        <header className="panel__header" data-tauri-drag-region>
          <div className="panel__identity">
            <span className="panel__mark" aria-hidden="true">
              sp
            </span>
            <div>
              <h1 className="panel__title">side-pilot companion</h1>
              <p className="panel__status">Ready when you are</p>
            </div>
          </div>
          <div className="panel__controls">
            <button
              type="button"
              className="panel__control panel__minimize"
              aria-label="Minimize to bubble"
              title="Minimize to bubble"
              onClick={() => dispatch("collapse")}
            >
              -
            </button>
            <button
              type="button"
              className="panel__control panel__close"
              aria-label="Collapse"
              title="Collapse"
              onClick={() => dispatch("collapse")}
            >
              x
            </button>
          </div>
        </header>
        <div className="panel__body">
          <div className="conversation" aria-live="polite">
            <article className="message message--assistant">
              <span className="message__label">Codex</span>
              <p>The desk is quiet and ready.</p>
            </article>
            <article className="message message--user">
              <span className="message__label">You</span>
              <p>Keep the desktop flow calm and close at hand.</p>
            </article>
          </div>
          <div className="composer" role="group" aria-label="Prompt composer">
            <span className="composer__text">Ask side-pilot</span>
            <button
              type="button"
              className="composer__send"
              aria-label="Send"
              disabled
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
