/**
 * Typed front-end seam over the Tauri chat commands (SP-005).
 *
 * The UI never calls `invoke` directly: it depends on the [`ChatApi`] interface
 * so components stay unit-testable with injected fakes (the same dependency-
 * injection pattern as `windowResize.ts`). `tauriChatApi` is the real
 * implementation; `inertChatApi` is a no-IPC stub for non-Tauri contexts and
 * tests of surrounding shell components.
 *
 * Field names match the Rust contract's camelCase serialization
 * (`adapters::contract`, `storage::model`).
 */

import { invoke } from "@tauri-apps/api/core";
import type { Sender } from "../state/chat";

/** Mirrors `adapters::AdapterRequest` (only the fields the MVP UI sends). */
export interface AdapterRequest {
  assistant: string;
  prompt: string;
  /** Model id passed to the CLI (`-m`). */
  model?: string;
  /** Reasoning effort passed to the CLI (`-c model_reasoning_effort=...`). */
  reasoningEffort?: string;
  resumeSessionId?: string;
  runId?: string;
}

/** Mirrors `adapters::AdapterResult`. */
export interface AdapterResult {
  assistantText: string;
  rawJson: string;
  nativeSessionId?: string | null;
}

/** Mirrors `storage::model::Session`. */
export interface PersistedSession {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  codexSessionId: string | null;
}

/** Mirrors `storage::model::Message`. */
export interface PersistedMessage {
  id: string;
  sessionId: string;
  seq: number;
  sender: Sender;
  assistantId: string | null;
  content: string;
  rawJson: string | null;
  createdAt: number;
}

/** Mirrors `storage::model::NewMessage`. */
export interface NewMessage {
  sessionId: string;
  sender: Sender;
  assistantId?: string;
  content: string;
  rawJson?: string;
}

export interface ChatApi {
  runAdapter(request: AdapterRequest): Promise<AdapterResult>;
  createSession(title?: string | null): Promise<PersistedSession>;
  appendMessage(message: NewMessage): Promise<PersistedMessage>;
  readHistory(sessionId: string): Promise<PersistedMessage[]>;
  listSessions(): Promise<PersistedSession[]>;
  updateCodexSessionId(
    sessionId: string,
    codexSessionId: string,
  ): Promise<void>;
}

/** The real backend, wired to the registered Tauri commands. */
export const tauriChatApi: ChatApi = {
  runAdapter: (request) => invoke("run_adapter", { request }),
  createSession: (title = null) => invoke("create_session", { title }),
  appendMessage: (message) => invoke("append_message", { message }),
  readHistory: (sessionId) => invoke("read_history", { sessionId }),
  listSessions: () => invoke("list_sessions"),
  updateCodexSessionId: (sessionId, codexSessionId) =>
    invoke("update_codex_session_id", { sessionId, codexSessionId }),
};

/**
 * No-IPC stub: an empty store that never reaches the backend. Used as a safe
 * default in non-Tauri contexts (e.g. shell-component tests) so mounting the
 * chat panel does not attempt to `invoke`.
 */
export const inertChatApi: ChatApi = {
  runAdapter: () =>
    Promise.reject(new Error("chat backend unavailable")),
  createSession: () =>
    Promise.resolve({
      id: "inert-session",
      title: null,
      createdAt: 0,
      updatedAt: 0,
      codexSessionId: null,
    }),
  appendMessage: (message) =>
    Promise.resolve({
      id: `inert-${message.sender}`,
      sessionId: message.sessionId,
      seq: 0,
      sender: message.sender,
      assistantId: message.assistantId ?? null,
      content: message.content,
      rawJson: message.rawJson ?? null,
      createdAt: 0,
    }),
  readHistory: () => Promise.resolve([]),
  listSessions: () => Promise.resolve([]),
  updateCodexSessionId: () => Promise.resolve(),
};

/** Map a `storage::Message` row onto the UI transcript shape. */
export function toChatMessage(row: PersistedMessage): {
  id: string;
  sender: Sender;
  assistantId?: string;
  content: string;
} {
  return {
    id: row.id,
    sender: row.sender,
    assistantId: row.assistantId ?? undefined,
    content: row.content,
  };
}

/**
 * Turn a rejected command (typed `AdapterError`/`StorageError`, a plain string,
 * or an `Error`) into a human-readable line for the chat's error banner.
 */
export function describeError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "kind" in err) {
    const tagged = err as { kind: string; stderr?: string; detail?: string };
    switch (tagged.kind) {
      case "binaryNotFound":
        return "GPT isn't available — the CLI wasn't found on your PATH.";
      case "notAuthenticated":
        return "GPT is not authenticated. Sign in to the CLI and try again.";
      case "timedOut":
        return "The request timed out before GPT responded.";
      case "cancelled":
        return "The request was cancelled.";
      case "nonZeroExit":
        return `GPT exited with an error${
          tagged.stderr ? `: ${tagged.stderr}` : ""
        }.`;
      case "outputParseFailure":
        return "GPT returned output that could not be read.";
      case "notFound":
        return "That conversation could not be found in local history.";
      case "query":
        return "Local history is unavailable right now.";
      default:
        return `Something went wrong (${tagged.kind}).`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
