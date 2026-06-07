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
  /** Exact provider configuration snapshotted for this reply. */
  model?: string;
  reasoningEffort?: string;
  /** Message text; assistant content is rendered as Markdown. */
  content: string;
  /** Creation time (ms epoch): DB `created_at`, or `Date.now()` for optimistic rows. */
  createdAt: number;
  /**
   * A provider slot awaiting its response in a multi-provider route (SP-017).
   * Renders a per-provider loading indicator until the route settles.
   */
  pending?: boolean;
  /**
   * This entry is a failed provider slot — `content` holds the error text and it
   * renders as an inline error card under the provider label (SP-017), not a toast.
   */
  error?: boolean;
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
  | { type: "error"; message: string }
  /**
   * Optimistically append the user's message plus one labeled pending slot per
   * target provider, and enter the pending state (multi-provider route, SP-017).
   */
  | { type: "routeSubmit"; userMessage: ChatMessage; slots: ChatMessage[] }
  /**
   * Replace the route's pending slots with their settled results (replies and/or
   * inline error cards) and return to idle.
   */
  | { type: "routeSettled"; results: ChatMessage[] }
  /**
   * Replace a failed provider message (by id) with a pending slot for a retry.
   * The error card is swapped for a loading indicator so the transcript stays
   * clean (no duplicate user prompt).
   */
  | { type: "retryReplace"; errorMessageId: string; slot: ChatMessage };

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
      // Keep the transcript but drop any in-flight provider slots, so a failed
      // route does not leave orphaned "Thinking…" placeholders. The user's
      // message and prior turns remain visible alongside the error.
      return {
        messages: state.messages.filter((m) => !m.pending),
        status: { kind: "error", message: action.message },
      };
    case "routeSubmit":
      return {
        messages: [...state.messages, action.userMessage, ...action.slots],
        status: { kind: "pending" },
      };
    case "routeSettled":
      // Swap the pending slots for their settled results (replies + error cards).
      return {
        messages: [...state.messages.filter((m) => !m.pending), ...action.results],
        status: { kind: "idle" },
      };
    case "retryReplace":
      // Replace a failed provider slot with a pending slot for a retry.
      return {
        messages: state.messages.map((m) =>
          m.id === action.errorMessageId ? action.slot : m,
        ),
        status: { kind: "pending" },
      };
  }
}
