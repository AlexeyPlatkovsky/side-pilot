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
import { describeCliExit } from "./providers";

// IPC types generated from the Rust contract by ts-rs (SP-065). These files in
// `./generated/` are the single source of truth for the wire shape: regenerate
// with `npm run gen:bindings` after changing `adapters::contract` or
// `storage::model`. CI fails if the committed bindings drift from the structs.
import type { AdapterRequest as RustAdapterRequest } from "./generated/AdapterRequest";
import type { AdapterResult as RustAdapterResult } from "./generated/AdapterResult";
import type { Session as RustSession } from "./generated/Session";
import type { Message as RustMessage } from "./generated/Message";
import type { NewMessage as RustNewMessage } from "./generated/NewMessage";
import type { RouteRequest as RustRouteRequest } from "./generated/RouteRequest";
import type { RouteRunResult as RustRouteRunResult } from "./generated/RouteRunResult";

/**
 * The request the UI sends to `run_adapter`. Projected from the Rust
 * `AdapterRequest` so renaming/removing one of these fields stops compiling
 * here. The omitted fields (`workingDirectory`, `permissionMode`, `timeoutMs`)
 * fall back to the backend's serde defaults.
 */
export type AdapterRequest = Pick<
  RustAdapterRequest,
  "assistant" | "prompt" | "model" | "reasoningEffort" | "resumeSessionId" | "runId"
>;

/**
 * The fields of `adapters::AdapterResult` the UI reads. Projected from the
 * generated type (the backend also reports `usage`, which the UI ignores) so a
 * renamed/removed field stops compiling here.
 */
export type AdapterResult = Pick<
  RustAdapterResult,
  "assistantText" | "rawJson" | "nativeSessionId"
>;

/** Re-exported straight from the Rust-derived bindings (single source of truth). */
export type PersistedSession = RustSession;
export type PersistedMessage = RustMessage;
export type NewMessage = RustNewMessage;

/**
 * The request the UI sends to `run_route` (SP-016/SP-017). The UI supplies the
 * route, prompt, active providers, and the configured Codex model; Claude and
 * Gemini use their CLI defaults. `timeoutMs` falls back to the backend's serde
 * default when omitted.
 */
export type RouteRequest = Pick<
  RustRouteRequest,
  "sessionId" | "route" | "prompt" | "activeProviders" | "model"
>;
export type RouteRunResult = RustRouteRunResult;

export interface ChatApi {
  runAdapter(request: AdapterRequest): Promise<AdapterResult>;
  /**
   * Route a prompt to one provider or to all active providers (SP-016). Persists
   * the prompt and each successful response server-side and returns one outcome
   * per provider; per-provider failures arrive inside the outcomes, not as a
   * rejection.
   */
  runRoute(request: RouteRequest): Promise<RouteRunResult>;
  createSession(title?: string | null): Promise<PersistedSession>;
  appendMessage(message: NewMessage): Promise<PersistedMessage>;
  readHistory(sessionId: string): Promise<PersistedMessage[]>;
  listSessions(): Promise<PersistedSession[]>;
  /** Rename a session (SP-050); does not reorder the list. */
  renameSession(sessionId: string, title: string | null): Promise<PersistedSession>;
  /** Delete a session and all of its messages (SP-050, cascade). */
  deleteSession(sessionId: string): Promise<void>;
  /** Clear a session's messages and native resume id, keeping the chat (SP-051). */
  clearSession(sessionId: string): Promise<PersistedSession>;
  updateCodexSessionId(sessionId: string, codexSessionId: string): Promise<void>;
  /**
   * Open an assistant-provided link in the OS default browser. The Rust side
   * validates the scheme (http/https/mailto only); the app's WebView never
   * navigates away from itself.
   */
  openExternal(url: string): Promise<void>;
}

/** The real backend, wired to the registered Tauri commands. */
export const tauriChatApi: ChatApi = {
  runAdapter: (request) => invoke("run_adapter", { request }),
  runRoute: (request) => invoke("run_route", { request }),
  createSession: (title = null) => invoke("create_session", { title }),
  appendMessage: (message) => invoke("append_message", { message }),
  readHistory: (sessionId) => invoke("read_history", { sessionId }),
  listSessions: () => invoke("list_sessions"),
  renameSession: (sessionId, title) => invoke("rename_session", { sessionId, title }),
  deleteSession: (sessionId) => invoke("delete_session", { sessionId }),
  clearSession: (sessionId) => invoke("clear_session", { sessionId }),
  updateCodexSessionId: (sessionId, codexSessionId) =>
    invoke("update_codex_session_id", { sessionId, codexSessionId }),
  openExternal: (url) => invoke("open_external", { url }),
};

/**
 * No-IPC stub: an empty store that never reaches the backend. Used as a safe
 * default in non-Tauri contexts (e.g. shell-component tests) so mounting the
 * chat panel does not attempt to `invoke`.
 */
export const inertChatApi: ChatApi = {
  runAdapter: () => Promise.reject(new Error("chat backend unavailable")),
  runRoute: () => Promise.reject(new Error("chat backend unavailable")),
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
      isError: false,
      createdAt: 0,
    }),
  readHistory: () => Promise.resolve([]),
  listSessions: () => Promise.resolve([]),
  renameSession: (sessionId, title) =>
    Promise.resolve({
      id: sessionId,
      title,
      createdAt: 0,
      updatedAt: 0,
      codexSessionId: null,
    }),
  deleteSession: () => Promise.resolve(),
  clearSession: (sessionId) =>
    Promise.resolve({
      id: sessionId,
      title: null,
      createdAt: 0,
      updatedAt: 0,
      codexSessionId: null,
    }),
  updateCodexSessionId: () => Promise.resolve(),
  openExternal: () => Promise.resolve(),
};

/** Map a `storage::Message` row onto the UI transcript shape. */
export function toChatMessage(row: PersistedMessage): {
  id: string;
  sender: Sender;
  assistantId?: string;
  content: string;
  createdAt: number;
  error?: boolean;
} {
  return {
    id: row.id,
    sender: row.sender,
    assistantId: row.assistantId ?? undefined,
    content: row.content,
    createdAt: row.createdAt,
    error: row.isError || undefined,
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
        return describeCliExit("GPT", tagged.stderr);
      case "outputParseFailure":
        return "GPT returned output that could not be read.";
      case "notFound":
        return "That conversation could not be found in local history.";
      case "query":
        return "Local history is unavailable right now.";
      case "storageUnavailable":
        return "Local history is unavailable right now.";
      case "unsupportedSchemaVersion":
        return "Local history was created by a newer app version.";
      default:
        return `Something went wrong (${tagged.kind}).`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
