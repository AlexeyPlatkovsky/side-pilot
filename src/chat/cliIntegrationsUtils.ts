import type { CliIntegration } from "./generated/CliIntegration";
import type { CliIntegrations } from "./generated/CliIntegrations";
import type { AssistantId } from "./generated/AssistantId";

/**
 * Merge fresh detection results into a persisted integrations snapshot.
 * Only `detectedStatus` is copied from detected entries; `enabled` flags are
 * always preserved from `persisted` so user toggles are never overwritten.
 */
export function mergeDetection(
  persisted: CliIntegrations,
  detected: CliIntegration[],
): CliIntegrations {
  const next = structuredClone(persisted);
  for (const d of detected) {
    const entry = findEntry(next, d.assistant);
    if (entry) {
      entry.detectedStatus = d.detectedStatus;
    }
  }
  return next;
}

export function findEntry(
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
  }
}
