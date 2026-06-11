import type { CliIntegration } from "./generated/CliIntegration";
import type { CliIntegrations } from "./generated/CliIntegrations";
import type { CustomCliEntry } from "./generated/CustomCliEntry";
import type { AssistantId } from "./generated/AssistantId";
import { isCustomAssistant } from "./assistantId";

/** The three built-in provider ids, in fixed display order. */
const BUILTIN_IDS = ["codex", "claude", "gemini"] as const;

/**
 * Merge fresh detection results into a persisted integrations snapshot.
 * Only `detectedStatus` is copied from detected entries; `enabled` flags are
 * always preserved from `persisted` so user toggles are never overwritten.
 * Custom CLIs are matched by name (SP-072).
 */
export function mergeDetection(
  persisted: CliIntegrations,
  detected: CliIntegration[],
): CliIntegrations {
  const next = structuredClone(persisted);
  for (const d of detected) {
    if (isCustomAssistant(d.assistant)) {
      const name = d.assistant.custom;
      const entry = next.custom.find((e) => e.name === name);
      if (entry) entry.detectedStatus = d.detectedStatus;
    } else {
      const entry = builtinEntry(next, d.assistant);
      if (entry) entry.detectedStatus = d.detectedStatus;
    }
  }
  return next;
}

/** The built-in `CliIntegration` slot for a built-in id, or `null`. */
export function builtinEntry(
  integrations: CliIntegrations,
  assistant: AssistantId,
): CliIntegration | null {
  switch (assistant) {
    case "codex":
      return integrations.codex;
    case "claude":
      return integrations.claude;
    case "gemini":
      return integrations.gemini;
    default:
      return null;
  }
}

/** A custom entry by (case-sensitive) name, or `null`. */
export function customEntry(
  integrations: CliIntegrations,
  name: string,
): CustomCliEntry | null {
  return integrations.custom.find((e) => e.name === name) ?? null;
}

/**
 * The enabled, routable providers in display order: enabled built-ins first,
 * then enabled custom CLIs. Mirrors the Rust `enabled_providers` (SP-072) so the
 * AI switcher and `All` route stay in step with the backend.
 */
export function enabledProviderIds(integrations: CliIntegrations): AssistantId[] {
  const builtins: AssistantId[] = BUILTIN_IDS.filter(
    (id) => builtinEntry(integrations, id)?.enabled,
  );
  const customs: AssistantId[] = integrations.custom
    .filter((e) => e.enabled)
    .map((e) => ({ custom: e.name }));
  return [...builtins, ...customs];
}

/** The total number of currently-enabled CLIs (built-ins + custom). */
export function enabledCount(integrations: CliIntegrations): number {
  const builtins = BUILTIN_IDS.filter(
    (id) => builtinEntry(integrations, id)?.enabled,
  ).length;
  const customs = integrations.custom.filter((e) => e.enabled).length;
  return builtins + customs;
}
