/**
 * AI provider registry and active-route helpers (SP-017).
 *
 * The AI switcher lets the user route a prompt to one provider or to all of
 * them. The active selection reuses the Rust-derived `Route` type (single
 * provider or `All`) so the UI cannot drift from the `run_route` contract.
 *
 * UI brand note: Codex is shown as **GPT** (never "Codex"); Claude and Gemini
 * use their own names. Settled messages use their persisted model/effort
 * snapshot via {@link messageLabel}.
 */

import type { AssistantId } from "./generated/AssistantId";
import type { AdapterError } from "./generated/AdapterError";
import type { Route } from "./generated/Route";
import { isCustomAssistant, sameAssistant } from "./assistantId";
import { translate } from "../i18n/translations";
import type { Locale } from "../i18n/types";

/** The active routing selection — single provider or every active provider. */
export type ActiveRoute = Route;

/** Per-provider UI presentation. */
export interface ProviderInfo {
  id: AssistantId;
  /** User-facing name (Codex → "GPT"). */
  label: string;
}

/**
 * Providers active for an `All` route, in display order. SP-015 caps this at 3;
 * making the set user-configurable is deferred to Settings (post-MVP).
 */
export const PROVIDERS: readonly ProviderInfo[] = [
  { id: "codex", label: "GPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
] as const;

/** Every active provider id, in display order. */
export const ALL_PROVIDER_IDS: readonly AssistantId[] = PROVIDERS.map((p) => p.id);

/** The default active route: a single GPT (Codex) provider. */
export const DEFAULT_ROUTE: ActiveRoute = { kind: "single", provider: "codex" };

/** Look up a provider's presentation. Custom CLIs use their user-supplied name. */
export function providerInfo(id: AssistantId): ProviderInfo {
  if (isCustomAssistant(id)) return { id, label: id.custom };
  return PROVIDERS.find((p) => p.id === id) ?? { id, label: id };
}

/** The user-facing label for a route ("All" or the single provider's name). */
export function routeLabel(route: ActiveRoute, locale: Locale = "en"): string {
  return route.kind === "all"
    ? translate(locale, "ai_all")
    : providerInfo(route.provider).label;
}

/** Whether two routes select the same target(s). */
export function routesEqual(a: ActiveRoute, b: ActiveRoute): boolean {
  if (a.kind === "all" || b.kind === "all") return a.kind === b.kind;
  return sameAssistant(a.provider, b.provider);
}

/**
 * The ordered provider targets a route resolves to.
 *
 * For `All` routes the result is the enabled providers in `activeProviders`,
 * ordered built-ins-first (canonical `PROVIDERS` order) then custom CLIs in their
 * given order — mirroring the Rust `enabled_providers` (SP-072) so the optimistic
 * pending slots match what the backend actually dispatches. An empty or omitted
 * `activeProviders` falls back to the built-in providers so legacy callers and
 * tests that omit the argument are unaffected.
 */
export function routeTargets(
  route: ActiveRoute,
  activeProviders?: readonly AssistantId[],
): AssistantId[] {
  if (route.kind === "all") {
    if (!activeProviders?.length) return [...ALL_PROVIDER_IDS];
    // Built-ins in canonical display order, then any custom CLIs (which the
    // static PROVIDERS list cannot enumerate) in activeProviders order.
    const builtins = ALL_PROVIDER_IDS.filter((id) =>
      activeProviders.some((active) => sameAssistant(active, id)),
    );
    const customs = activeProviders.filter(isCustomAssistant);
    return [...builtins, ...customs];
  }
  if (
    activeProviders?.length &&
    !activeProviders.some((active) => sameAssistant(active, route.provider))
  ) {
    return [];
  }
  return [route.provider];
}

/**
 * The transcript label for an assistant/provider message. Settled provider
 * replies use their exact snapshotted model and reasoning effort.
 */
export function messageLabel(
  assistantId: string | undefined,
  model: string | undefined,
  reasoningEffort: string | undefined,
  locale: Locale = "en",
): string {
  if (model) return `${model}-${reasoningEffort || "none"}`;
  if (!assistantId) return translate(locale, "assistant");
  // A custom CLI's persisted key is `custom:<name>`; show the bare name (SP-072).
  if (assistantId.startsWith("custom:")) return assistantId.slice("custom:".length);
  const info = PROVIDERS.find((p) => p.id === assistantId);
  return info?.label ?? assistantId;
}

const MAX_PROVIDER_ERROR_DETAIL_CHARS = 240;

function truncateErrorDetail(detail: string): string {
  const chars = Array.from(detail);
  if (chars.length <= MAX_PROVIDER_ERROR_DETAIL_CHARS) return detail;
  return `${chars.slice(0, MAX_PROVIDER_ERROR_DETAIL_CHARS - 1).join("")}…`;
}

function stripLogPrefixes(line: string): string {
  let result = line.trim();
  while (result.startsWith("[")) {
    const end = result.indexOf("]");
    if (end < 0) break;
    result = result.slice(end + 1).trimStart();
  }
  return result;
}

function extractNamedError(stderr: string): string | undefined {
  const marker = "Error: ";
  const start = stderr.lastIndexOf(marker);
  if (start < 0) return undefined;

  let detail = stderr.slice(start + marker.length);
  const cutAt = ["\n", "\r", " at ", " {"]
    .map((delimiter) => detail.indexOf(delimiter))
    .filter((index) => index >= 0);
  if (cutAt.length > 0) detail = detail.slice(0, Math.min(...cutAt));
  detail = detail.trim().replace(/\s+/g, " ");
  return detail || undefined;
}

function isStructuredDumpLine(line: string): boolean {
  if (
    line.startsWith("{") ||
    line.startsWith("}") ||
    line.startsWith('"') ||
    line.startsWith("'") ||
    /^[[\],]+$/.test(line)
  ) {
    return true;
  }
  const colon = line.indexOf(":");
  if (colon < 0) return false;
  const key = line
    .slice(0, colon)
    .trim()
    .replace(/^["']|["']$/g, "");
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key);
}

function summarizeCliStderr(stderr: string): string | undefined {
  const trimmed = stderr.trim();
  if (!trimmed) return undefined;

  const namedError = extractNamedError(trimmed);
  if (namedError) return truncateErrorDetail(namedError);

  const usefulLine = trimmed
    .split(/\r?\n/)
    .map(stripLogPrefixes)
    .filter(
      (line) =>
        line &&
        !line.startsWith("at ") &&
        !line.startsWith("Full report available at:") &&
        !/^Error when talking to .+ API$/.test(line) &&
        !isStructuredDumpLine(line),
    )
    .at(-1);
  if (!usefulLine) return undefined;
  return truncateErrorDetail(usefulLine.replace(/\s+/g, " "));
}

function asSentence(detail: string): string {
  return /[.!?…]$/.test(detail) ? detail : `${detail}.`;
}

/** A concise user-visible message for a CLI process that exited unsuccessfully. */
export function describeCliExit(
  name: string,
  stderr: string | undefined,
  locale: Locale = "en",
): string {
  const detail = summarizeCliStderr(stderr ?? "");
  if (detail) {
    return translate(locale, "error_cliExitWithDetail", {
      name,
      detail: asSentence(detail),
    });
  }
  return translate(locale, "error_cliExit", { name });
}

/**
 * A human-readable, provider-named message for a failed slot's inline error
 * card (SP-017). Unlike `describeError`, this names the actual provider instead
 * of always saying "GPT".
 */
export function describeProviderError(
  error: AdapterError,
  provider: AssistantId,
  locale: Locale = "en",
): string {
  const name = providerInfo(provider).label;
  switch (error.kind) {
    case "binaryNotFound":
      return translate(locale, "error_binaryNotFound", { name });
    case "notAuthenticated":
      return translate(locale, "error_notAuthenticated", { name });
    case "timedOut":
      return translate(locale, "error_timedOut", { name });
    case "cancelled":
      return translate(locale, "error_cancelled", { name });
    case "nonZeroExit":
      return describeCliExit(name, error.stderr, locale);
    case "outputParseFailure":
      return translate(locale, "error_outputParseFailure", { name });
    default:
      return translate(locale, "error_defaultError", { name });
  }
}
