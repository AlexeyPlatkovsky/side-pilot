/**
 * Pure state machine for the chat panel (SP-006).
 *
 * The reducer owns the conversation transcript and the blocking/error status so
 * the transitions can be unit-tested without React or a live Tauri backend. The
 * `ChatPanel` hook wires this reducer to the IPC seam (`chat/api.ts`).
 *
 * MVP scope is Codex-only display, but `ChatMessage` carries `assistantId` so
 * future Claude/Gemini/all/summarize entries can be represented without
 * reshaping the transcript.
 */

// Single source of truth for the message sender is the Rust `Sender` enum,
// surfaced through the ts-rs binding (SP-065) so this type cannot drift from the
// backend. Re-exported here because the reducer/transcript are its main users.
export type { Sender } from "../chat/generated/Sender";
import type { Sender } from "../chat/generated/Sender";

export interface ChatMessage {
  /** Stable id — client-generated for optimistic rows, DB id once persisted. */
  id: string;
  sender: Sender;
  /** Which assistant produced an assistant message (`codex` for the MVP). */
  assistantId?: string;
  /** Message text; assistant content is rendered as Markdown. */
  content: string;
  /** Creation time (ms epoch): DB `created_at`, or `Date.now()` for optimistic rows. */
  createdAt: number;
}

/**
 * Conversation status. `pending` drives the thinking indicator during a
 * blocking CLI call; `error` surfaces a failure without dropping the transcript.
 */
export type ChatStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string };

export interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
}

export type ChatAction =
  /**
   * Replace the transcript with reloaded history (app start / session switch).
   * `pending` restores the thinking state when the loaded session still has a
   * reply in flight, so switching back to it shows "Thinking…" again.
   */
  | { type: "loaded"; messages: ChatMessage[]; pending?: boolean }
  /** Optimistically append the user's message and enter the pending state. */
  | { type: "submit"; message: ChatMessage }
  /** Append the assistant's reply and return to idle. */
  | { type: "success"; message: ChatMessage }
  /** Surface a failure; the existing transcript (incl. the user message) stays. */
  | { type: "error"; message: string };

export const initialChatState: ChatState = {
  messages: [],
  status: { kind: "idle" },
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "loaded":
      return {
        messages: action.messages,
        status: action.pending ? { kind: "pending" } : { kind: "idle" },
      };
    case "submit":
      return {
        messages: [...state.messages, action.message],
        status: { kind: "pending" },
      };
    case "success":
      return {
        messages: [...state.messages, action.message],
        status: { kind: "idle" },
      };
    case "error":
      // Keep the transcript; only the status changes so the user's message and
      // any prior turns remain visible alongside the error.
      return { ...state, status: { kind: "error", message: action.message } };
  }
}
