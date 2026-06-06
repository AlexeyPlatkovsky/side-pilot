/**
 * AI provider registry and active-route helpers (SP-017).
 *
 * The AI switcher lets the user route a prompt to one provider or to all of
 * them. The active selection reuses the Rust-derived `Route` type (single
 * provider or `All`) so the UI cannot drift from the `run_route` contract.
 *
 * UI brand note: Codex is shown as **GPT** (never "Codex") per `chat/config.ts`;
 * Claude and Gemini use their own names. The model/effort badge ("GPT-5.5-medium")
 * still applies to the Codex/GPT slot via {@link messageLabel}.
 */

import type { AssistantId } from "./generated/AssistantId";
import type { AdapterError } from "./generated/AdapterError";
import type { Route } from "./generated/Route";
import { assistantModelLabel } from "./config";

/** The active routing selection — single provider or every active provider. */
export type ActiveRoute = Route;

/** Per-provider UI presentation. `glyph` is the monogram shown in the icon. */
export interface ProviderInfo {
  id: AssistantId;
  /** User-facing name (Codex → "GPT"). */
  label: string;
  /** Short monogram rendered inside the provider icon. */
  glyph: string;
  /** CSS modifier suffix for the icon's accent color (`provider-icon--<accent>`). */
  accent: string;
}

/**
 * Providers active for an `All` route, in display order. SP-015 caps this at 3;
 * making the set user-configurable is deferred to Settings (post-MVP).
 */
export const PROVIDERS: readonly ProviderInfo[] = [
  { id: "codex", label: "GPT", glyph: "G", accent: "gpt" },
  { id: "claude", label: "Claude", glyph: "C", accent: "claude" },
  { id: "gemini", label: "Gemini", glyph: "✦", accent: "gemini" },
] as const;

/** Every active provider id, in display order. */
export const ALL_PROVIDER_IDS: readonly AssistantId[] = PROVIDERS.map((p) => p.id);

/** The default active route: a single GPT (Codex) provider. */
export const DEFAULT_ROUTE: ActiveRoute = { kind: "single", provider: "codex" };

/** Look up a provider's presentation, falling back for unknown ids. */
export function providerInfo(id: AssistantId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? { id, label: id, glyph: "?", accent: "gpt" };
}

/** The user-facing label for a route ("All" or the single provider's name). */
export function routeLabel(route: ActiveRoute): string {
  return route.kind === "all" ? "All" : providerInfo(route.provider).label;
}

/** Whether two routes select the same target(s). */
export function routesEqual(a: ActiveRoute, b: ActiveRoute): boolean {
  if (a.kind === "all" || b.kind === "all") return a.kind === b.kind;
  return a.provider === b.provider;
}

/** The ordered provider targets a route resolves to. */
export function routeTargets(route: ActiveRoute): AssistantId[] {
  return route.kind === "all" ? [...ALL_PROVIDER_IDS] : [route.provider];
}

/**
 * The transcript label for an assistant/provider message. The GPT slot keeps the
 * model+effort badge ("GPT-5.5-medium"); other providers show their plain name.
 */
export function messageLabel(assistantId: string | undefined): string {
  if (assistantId === "codex") return assistantModelLabel;
  if (!assistantId) return "Assistant";
  return providerInfo(assistantId as AssistantId).label;
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
    /^[\[\],]+$/.test(line)
  ) {
    return true;
  }
  const colon = line.indexOf(":");
  if (colon < 0) return false;
  const key = line.slice(0, colon).trim().replace(/^["']|["']$/g, "");
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
export function describeCliExit(name: string, stderr: string | undefined): string {
  const detail = summarizeCliStderr(stderr ?? "");
  return detail
    ? `${name} exited with an error: ${asSentence(detail)}`
    : `${name} exited with an error.`;
}

/**
 * A human-readable, provider-named message for a failed slot's inline error
 * card (SP-017). Unlike `describeError`, this names the actual provider instead
 * of always saying "GPT".
 */
export function describeProviderError(error: AdapterError, provider: AssistantId): string {
  const name = providerInfo(provider).label;
  switch (error.kind) {
    case "binaryNotFound":
      return `${name} isn't available — its CLI wasn't found on your PATH.`;
    case "notAuthenticated":
      return `${name} is not authenticated. Sign in to its CLI and try again.`;
    case "timedOut":
      return `${name} timed out before responding.`;
    case "cancelled":
      return `The ${name} request was cancelled.`;
    case "nonZeroExit":
      return describeCliExit(name, error.stderr);
    case "outputParseFailure":
      return `${name} returned output that could not be read.`;
    default:
      return `Something went wrong with ${name}.`;
  }
}
