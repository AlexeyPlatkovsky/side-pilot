import { useEffect, useReducer, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { bubbleReducer, type BubbleState } from "../state/bubbleState";
import { applyWindowSize } from "../state/windowResize";
import { useClickVsDrag } from "../state/drag";
import { ChatPanel } from "./ChatPanel";
import { useChat } from "../chat/useChat";
import { Settings } from "./Settings";
import { inertChatApi, type ChatApi } from "../chat/api";
import type { ActiveRoute } from "../chat/providers";
// Single source of truth for the app mark: the same artwork bundled as the
// macOS/Windows app (Dock) icon, reused for the collapsed bubble and the
// panel header so all three reads identically.
import appIcon from "../assets/app-icon_3.png";

export interface BubbleProps {
  /** Initial visual state. Defaults to the compact bubble. */
  initialState?: BubbleState;
  /**
   * Resizes the OS window for a given state. Injectable so tests can run
   * without a live Tauri window; defaults to the real Tauri resize.
   */
  resizeWindow?: (state: BubbleState) => void;
  /**
   * Backend seam for the chat body, forwarded to {@link ChatPanel}. Injectable
   * so shell tests stay offline; the real app passes `tauriChatApi`.
   */
  chatApi?: ChatApi;
}

/**
 * The floating bubble (SP-004, SP-030, SP-031): a compact always-on-top dot
 * that expands into the chat panel on click. The panel has a gear control that
 * opens an in-panel settings view with a section rail (SP-030, SP-031); the
 * rail lists seven sections and each pane is an empty placeholder for now.
 * Escape steps back one level (settings → panel, panel → bubble) and the close
 * control collapses straight to the bubble. The actual chat UI is delivered
 * later (SP-006); this owns the shell shape, the settings sub-view including
 * the section rail, and the window-size transitions.
 */
export function Bubble({
  initialState = "collapsed",
  resizeWindow = applyWindowSize,
  chatApi = inertChatApi,
}: BubbleProps) {
  const [state, dispatch] = useReducer(bubbleReducer, initialState);
  const [routesBySession, setRoutesBySession] = useState<Record<string, ActiveRoute>>({});
  const chat = useChat(chatApi);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPos = useRef<{ x: number; y: number } | null>(null);

  // The collapsed dot and the panel mark are both window-drag handles and click
  // targets; this shared hook tells a click apart from a drag so dragging the
  // window doesn't spuriously expand/collapse it.
  const dotHandlers = useClickVsDrag(() => dispatch("expand"));
  const markHandlers = useClickVsDrag(() => dispatch("collapse"));

  // The collapsed bubble has its own tiny size; every other ("panel") view —
  // expanded, settings, and any future view — shares one window size. We only
  // resize when crossing that bubble<->panel boundary (or on first render), so
  // switching between panel views preserves whatever size the user dragged the
  // window to instead of snapping it back to a canonical size.
  const prevSizeStateRef = useRef<BubbleState | null>(null);
  useEffect(() => {
    const prev = prevSizeStateRef.current;
    prevSizeStateRef.current = state;
    const crossedBoundary = (prev === "collapsed") !== (state === "collapsed");
    if (prev === null || crossedBoundary) {
      resizeWindow(state);
    }
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

  useEffect(() => {
    const api = chatApi;
    if (api === inertChatApi) return;
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    const savePosition = async () => {
      try {
        const pos = lastSavedPos.current;
        if (!pos) return;
        const prefs = await api.getGeneralPreferences();
        const updated = { ...prefs, lastKnownPosition: pos };
        await api.updateGeneralPreferences(updated);
      } catch {
        // best-effort position tracking
      }
    };

    const scheduleSave = (pos: { x: number; y: number }) => {
      lastSavedPos.current = pos;
      if (moveTimer.current) clearTimeout(moveTimer.current);
      moveTimer.current = setTimeout(() => {
        if (!cancelled) savePosition();
      }, 1000);
    };

    getCurrentWindow()
      .onMoved((event) => {
        if (!cancelled) scheduleSave({ x: event.payload.x, y: event.payload.y });
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlistenFn = fn;
      });

    return () => {
      cancelled = true;
      if (moveTimer.current) clearTimeout(moveTimer.current);
      unlistenFn?.();
    };
  }, [chatApi]);

  if (state === "collapsed") {
    return (
      <div className="bubble bubble--collapsed">
        <button
          type="button"
          className="bubble__dot"
          aria-label="Open side-pilot"
          data-tauri-drag-region
          onMouseDown={dotHandlers.onMouseDown}
          onClick={dotHandlers.onClick}
        >
          <img className="bubble__icon" src={appIcon} alt="" draggable={false} />
        </button>
      </div>
    );
  }

  const inSettings = state === "settings";

  return (
    <div className={`bubble ${inSettings ? "bubble--settings" : "bubble--expanded"}`}>
      <section className="panel" data-testid={inSettings ? "settings" : "panel"}>
        <header className="panel__header" data-tauri-drag-region>
          <div className="panel__identity">
            <button
              type="button"
              className="panel__mark"
              aria-label="Minimize"
              title="Minimize"
              data-tauri-drag-region
              onMouseDown={markHandlers.onMouseDown}
              onClick={markHandlers.onClick}
            >
              <img
                className="panel__mark-icon"
                src={appIcon}
                alt=""
                draggable={false}
                data-tauri-drag-region
              />
            </button>
            <div>
              <h1 className="panel__title" data-tauri-drag-region>
                {inSettings ? "Settings" : "side-pilot companion"}
              </h1>
              <p className="panel__status" data-tauri-drag-region>
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
            {/* Section rail and panes (SP-031). Empty placeholder panes arrive with
                later tasks filling each section. */}
            <Settings chatApi={chatApi} />
          </div>
        ) : (
          <ChatPanel
            api={chatApi}
            chat={chat}
            routesBySession={routesBySession}
            setRoutesBySession={setRoutesBySession}
          />
        )}
      </section>
    </div>
  );
}
