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
 * The floating bubble (SP-004, SP-030): a compact always-on-top dot that
 * expands into the chat panel on click. The panel has a gear control that opens
 * an in-panel settings sub-view (SP-030); the section rail itself arrives in
 * SP-031. Escape steps back one level (settings → panel, panel → bubble) and
 * the close control collapses straight to the bubble. The actual chat UI is
 * delivered later (SP-006); this owns only the shell shape, the settings
 * sub-view, and the window-size transitions.
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
        // Steps back one level: settings -> panel, panel -> bubble. The reducer
        // owns the mapping so this handler stays stateless.
        dispatch("escape");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The header's lead control swaps between the gear (panel) and Back (settings)
  // on view change. Move keyboard focus to the newly-active control so it never
  // drops to <body>, keeping the keyboard/screen-reader path continuous.
  const leadControlRef = useRef<HTMLButtonElement | null>(null);
  const prevStateRef = useRef(state);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    const swappedSettingsView =
      (prev === "expanded" && state === "settings") ||
      (prev === "settings" && state === "expanded");
    if (swappedSettingsView) {
      leadControlRef.current?.focus();
    }
  }, [state]);

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

  const inSettings = state === "settings";

  return (
    <div className={`bubble ${inSettings ? "bubble--settings" : "bubble--expanded"}`}>
      <section
        className="panel"
        data-testid={inSettings ? "settings" : "panel"}
      >
        <header className="panel__header" data-tauri-drag-region>
          <div className="panel__identity">
            <span className="panel__mark" aria-hidden="true">
              sp
            </span>
            <div>
              <h1 className="panel__title">
                {inSettings ? "Settings" : "side-pilot companion"}
              </h1>
              <p className="panel__status">
                {inSettings ? "Tune your companion" : "Ready when you are"}
              </p>
            </div>
          </div>
          <div className="panel__controls">
            {inSettings ? (
              <button
                ref={leadControlRef}
                type="button"
                className="panel__control panel__back"
                aria-label="Back to panel"
                title="Back to panel"
                onClick={() => dispatch("closeSettings")}
              >
                ‹
              </button>
            ) : (
              <button
                ref={leadControlRef}
                type="button"
                className="panel__control panel__settings"
                aria-label="Open settings"
                title="Open settings"
                onClick={() => dispatch("openSettings")}
              >
                ⚙
              </button>
            )}
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
        {inSettings ? (
          <div className="panel__body settings">
            {/* Section rail and panes arrive in SP-031; this is the shell. */}
            <p className="settings__placeholder">
              Settings sections arrive next.
            </p>
          </div>
        ) : (
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
        )}
      </section>
    </div>
  );
}
