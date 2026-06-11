/**
 * Helpers for the `AssistantId` wire union (SP-072).
 *
 * The Rust `AssistantId` serializes built-ins as bare strings
 * (`"codex"`/`"claude"`/`"gemini"`) and a user-registered custom CLI as
 * `{ custom: "<name>" }`. These helpers normalize that union so UI code can key,
 * compare, and label providers uniformly without repeating the shape check.
 */

import type { AssistantId } from "./generated/AssistantId";

/** The object branch of the `AssistantId` union. */
export type CustomAssistantId = { custom: string };

/** A built-in provider id (the string branch of the union). */
export type BuiltinAssistantId = Exclude<AssistantId, CustomAssistantId>;

/** Whether `id` identifies a user-registered custom CLI. */
export function isCustomAssistant(id: AssistantId): id is CustomAssistantId {
  return typeof id === "object" && id !== null && "custom" in id;
}

/** The display name of a custom provider, or `undefined` for a built-in. */
export function customName(id: AssistantId): string | undefined {
  return isCustomAssistant(id) ? id.custom : undefined;
}

/**
 * A stable string key for an assistant id, matching the Rust `as_str`:
 * `"codex"` for built-ins, `"custom:<name>"` for a custom CLI. Safe to use as a
 * React key, a `data-` attribute, or a map key.
 */
export function assistantKey(id: AssistantId): string {
  return isCustomAssistant(id) ? `custom:${id.custom}` : id;
}

/** Whether two assistant ids refer to the same provider. */
export function sameAssistant(a: AssistantId, b: AssistantId): boolean {
  return assistantKey(a) === assistantKey(b);
}
