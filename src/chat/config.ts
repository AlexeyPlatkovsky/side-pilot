/**
 * Assistant model configuration (MVP — a single model).
 *
 * `id` is the model id sent to the Codex CLI via `-m`; `effort` is the reasoning
 * effort sent via `-c model_reasoning_effort=...` and shown in the UI. `label`
 * is the user-facing model name. The badge on each assistant reply is
 * `${label}-${effort}` — e.g. "GPT-5.5-medium".
 *
 * IMPORTANT: `id` must be a model the installed Codex CLI actually supports — an
 * unknown id makes `codex exec` fail at runtime. This is the single place to
 * change the model/effort the app requests and displays.
 */
export const ASSISTANT_MODEL = {
  /** Model id passed to the CLI (`-m`). Must be a real Codex-supported model. */
  id: "gpt-5.5",
  /** User-facing model name (UI brand is "GPT", never "Codex"). */
  label: "GPT-5.5",
  /** Reasoning effort: "low" | "medium" | "high". Sent to the CLI and shown. */
  effort: "medium",
} as const;

/** Badge shown on each assistant reply, e.g. "GPT-5.5-medium". */
export const assistantModelLabel = `${ASSISTANT_MODEL.label}-${ASSISTANT_MODEL.effort}`;
