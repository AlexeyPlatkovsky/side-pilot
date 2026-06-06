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
      return `${name} exited with an error${error.stderr ? `: ${error.stderr}` : ""}.`;
    case "outputParseFailure":
      return `${name} returned output that could not be read.`;
    default:
      return `Something went wrong with ${name}.`;
  }
}
