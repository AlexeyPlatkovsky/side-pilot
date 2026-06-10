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
import { translate } from "../i18n/translations";
import type { Locale } from "../i18n/types";

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
import type { ProviderRunOutcome as RustProviderRunOutcome } from "./generated/ProviderRunOutcome";
import type { ProviderPreferences } from "./generated/ProviderPreferences";
import type { GeneralPreferences } from "./generated/GeneralPreferences";
import type { AssistantId } from "./generated/AssistantId";
import type { CliIntegration } from "./generated/CliIntegration";
import type { CliIntegrations } from "./generated/CliIntegrations";

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
 * route, prompt, and active providers. The backend snapshots the fixed global
 * provider preferences. `timeoutMs` falls back to the backend's serde default
 * when omitted.
 */
export type RouteRequest = Pick<
  RustRouteRequest,
  "sessionId" | "route" | "prompt" | "activeProviders"
>;
export type RouteRunResult = RustRouteRunResult;
export type ProviderRunOutcome = RustProviderRunOutcome;

/** The request the UI sends to `retry_route`. */
export interface RetryRouteRequest {
  sessionId: string;
  errorMessageId: string;
  provider: AssistantId;
  prompt: string;
}

export interface ChatApi {
  runAdapter(request: AdapterRequest): Promise<AdapterResult>;
  /**
   * Route a prompt to one provider or to all active providers (SP-016). Persists
   * the prompt and each successful response server-side and returns one outcome
   * per provider; per-provider failures arrive inside the outcomes, not as a
   * rejection.
   */
  runRoute(request: RouteRequest): Promise<RouteRunResult>;
  /**
   * Retry a prompt for a single provider after a failure. Deletes the old error
   * message from history, dispatches a fresh adapter run, and returns the
   * outcome.
   */
  retryRoute(request: RetryRouteRequest): Promise<ProviderRunOutcome>;
  getProviderPreferences(): Promise<ProviderPreferences>;
  updateProviderPreferences(value: ProviderPreferences): Promise<ProviderPreferences>;
  getGeneralPreferences(): Promise<GeneralPreferences>;
  updateGeneralPreferences(value: GeneralPreferences): Promise<GeneralPreferences>;
  /** Detect installed CLIs. Returns detection results without persisting. */
  detectClis(): Promise<CliIntegration[]>;
  /** Get persisted CLI integrations (enabled flags + last known statuses). */
  getCliIntegrations(): Promise<CliIntegrations>;
  /** Persist and activate CLI integration toggles. */
  updateCliIntegrations(value: CliIntegrations): Promise<CliIntegrations>;
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
/* v8 ignore next 16 */
export const tauriChatApi: ChatApi = {
  runAdapter: (request) => invoke("run_adapter", { request }),
  runRoute: (request) => invoke("run_route", { request }),
  retryRoute: (request) => invoke("retry_route", { ...request }),
  getProviderPreferences: () => invoke("get_provider_preferences"),
  updateProviderPreferences: (value) => invoke("update_provider_preferences", { value }),
  getGeneralPreferences: () => invoke("get_general_preferences"),
  updateGeneralPreferences: (value) => invoke("update_general_preferences", { value }),
  detectClis: () => invoke("detect_clis"),
  getCliIntegrations: () => invoke("get_cli_integrations"),
  updateCliIntegrations: (value) => invoke("update_cli_integrations", { value }),
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
  retryRoute: () => Promise.reject(new Error("chat backend unavailable")),
  getProviderPreferences: () => Promise.reject(new Error("chat backend unavailable")),
  updateProviderPreferences: () => Promise.reject(new Error("chat backend unavailable")),
  getGeneralPreferences: () => Promise.reject(new Error("chat backend unavailable")),
  updateGeneralPreferences: () => Promise.reject(new Error("chat backend unavailable")),
  detectClis: () =>
    Promise.resolve([]),
  getCliIntegrations: () => Promise.reject(new Error("chat backend unavailable")),
  updateCliIntegrations: () => Promise.reject(new Error("chat backend unavailable")),
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
      model: message.model ?? null,
      reasoningEffort: message.reasoningEffort ?? null,
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
  model?: string;
  reasoningEffort?: string;
  content: string;
  createdAt: number;
  error?: boolean;
} {
  return {
    id: row.id,
    sender: row.sender,
    assistantId: row.assistantId ?? undefined,
    model: row.model ?? undefined,
    reasoningEffort: row.reasoningEffort ?? undefined,
    content: row.content,
    createdAt: row.createdAt,
    error: row.isError || undefined,
  };
}

/**
 * Turn a rejected command (typed `AdapterError`/`StorageError`, a plain string,
 * or an `Error`) into a human-readable line for the chat's error banner.
 */
export function describeError(err: unknown, locale: Locale = "en"): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "kind" in err) {
    const tagged = err as { kind: string; stderr?: string; detail?: string };
    switch (tagged.kind) {
      case "binaryNotFound":
        return translate(locale, "error_binaryNotFound", { name: "GPT" });
      case "notAuthenticated":
        return translate(locale, "error_notAuthenticated", { name: "GPT" });
      case "timedOut":
        return translate(locale, "error_timedOut", { name: "GPT" });
      case "cancelled":
        return translate(locale, "error_cancelled", { name: "GPT" });
      case "nonZeroExit":
        return describeCliExit("GPT", tagged.stderr, locale);
      case "outputParseFailure":
        return translate(locale, "error_outputParseFailure", { name: "GPT" });
      case "notFound":
        return translate(locale, "error_notFound");
      case "query":
        return translate(locale, "error_storageUnavailable");
      case "storageUnavailable":
        return translate(locale, "error_storageUnavailable");
      case "unsupportedSchemaVersion":
        return translate(locale, "error_unsupportedSchemaVersion");
      default:
        return translate(locale, "error_somethingWentWrongWithKind", {
          kind: tagged.kind,
        });
    }
  }
  if (err instanceof Error) return err.message;
  return translate(locale, "error_somethingWentWrong");
}
