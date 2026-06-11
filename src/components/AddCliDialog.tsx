/**
 * Add-a-custom-CLI dialog (SP-072).
 *
 * Collects a display name (≤30 chars) and a "CLI Prompt Command" (≤100 chars),
 * validates them against existing custom entries and the reserved built-in
 * tokens, and lets the user Test the command (stdin "hello", 30 s) and/or Save.
 * Built on {@link Dialog} for the focus trap, Escape-to-cancel, and focus
 * restoration; Enter submits when the form is valid.
 */

import { useMemo, useState } from "react";

import { Dialog } from "./Dialog";
import type { ChatApi } from "../chat/api";
import { useI18n } from "../i18n/useI18n";
import type { Locale } from "../i18n/types";

/** Built-in base commands a custom CLI may not reuse. */
export const RESERVED_BASE_COMMANDS = ["codex", "claude", "gemini"] as const;

const MAX_NAME = 30;
const MAX_COMMAND = 100;

export interface AddCliDialogProps {
  api: ChatApi;
  /** Existing custom CLI names (case-sensitive duplicate check). */
  existingNames: string[];
  /** Existing custom base commands (first whitespace-delimited token). */
  existingBaseCommands: string[];
  /** Persist the new entry. Called only when the form is valid. */
  onSave: (name: string, command: string) => void;
  /** Close without saving (Cancel, Escape, overlay focus loss). */
  onClose: () => void;
  locale?: Locale;
}

/** The first whitespace-delimited token of a command (its "base command"). */
export function baseCommand(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "result"; ok: boolean; message: string };

export function AddCliDialog({
  api,
  existingNames,
  existingBaseCommands,
  onSave,
  onClose,
  locale = "en",
}: AddCliDialogProps) {
  const { t } = useI18n(locale);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const trimmedName = name.trim();
  const token = baseCommand(command);

  const nameError = useMemo(() => {
    if (trimmedName && existingNames.includes(trimmedName)) {
      return t("cli_errDuplicateName");
    }
    return null;
  }, [trimmedName, existingNames, t]);

  const commandError = useMemo(() => {
    if (!token) return null;
    if ((RESERVED_BASE_COMMANDS as readonly string[]).includes(token)) {
      return t("cli_errReservedCommand", { token });
    }
    if (existingBaseCommands.includes(token)) {
      return t("cli_errDuplicateCommand", { token });
    }
    return null;
  }, [token, existingBaseCommands, t]);

  const bothFilled = trimmedName.length > 0 && command.trim().length > 0;
  const hasError = nameError !== null || commandError !== null;
  const inFlight = test.kind === "running";
  const canTest = bothFilled && !inFlight;
  const canSave = bothFilled && !hasError && !inFlight;

  const runTest = async () => {
    setTest({ kind: "running" });
    try {
      await api.testCustomCli(command.trim());
      setTest({ kind: "result", ok: true, message: t("cli_testSucceeded") });
    } catch (err) {
      const timedOut =
        err !== null &&
        typeof err === "object" &&
        "kind" in err &&
        (err as { kind?: string }).kind === "timedOut";
      setTest({
        kind: "result",
        ok: false,
        message: timedOut ? t("cli_testTimedOut") : t("cli_testNotReady"),
      });
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    onSave(trimmedName, command.trim());
  };

  return (
    <Dialog label={t("cli_addDialogTitle")} onClose={onClose}>
      <form className="add-cli" onSubmit={handleSubmit}>
        <label className="add-cli__field">
          <span className="add-cli__label">{t("cli_nameLabel")}</span>
          <input
            className="add-cli__input"
            type="text"
            value={name}
            maxLength={MAX_NAME}
            placeholder={t("cli_namePlaceholder")}
            disabled={inFlight}
            aria-invalid={nameError !== null}
            onChange={(e) => setName(e.target.value)}
          />
          {nameError && (
            <span className="add-cli__error" aria-live="polite">
              {nameError}
            </span>
          )}
        </label>

        <label className="add-cli__field">
          <span className="add-cli__label">{t("cli_commandLabel")}</span>
          <input
            className="add-cli__input"
            type="text"
            value={command}
            maxLength={MAX_COMMAND}
            placeholder={t("cli_commandPlaceholder")}
            disabled={inFlight}
            aria-invalid={commandError !== null}
            onChange={(e) => setCommand(e.target.value)}
          />
          {commandError && (
            <span className="add-cli__error" aria-live="polite">
              {commandError}
            </span>
          )}
        </label>

        {test.kind === "result" && (
          <p
            className={`add-cli__test-result${test.ok ? " add-cli__test-result--ok" : " add-cli__test-result--error"}`}
            role="alert"
          >
            {test.message}
          </p>
        )}

        <div className="add-cli__actions">
          <button
            type="button"
            className="settings-btn"
            disabled={inFlight}
            onClick={onClose}
          >
            {t("cli_cancel")}
          </button>
          <button
            type="button"
            className="settings-btn"
            disabled={!canTest}
            onClick={() => void runTest()}
          >
            {inFlight ? t("cli_testing") : t("cli_test")}
          </button>
          <button
            type="submit"
            className="settings-btn settings-btn--primary"
            disabled={!canSave}
          >
            {t("cli_save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
