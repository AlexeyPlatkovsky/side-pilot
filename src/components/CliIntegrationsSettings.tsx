import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatApi } from "../chat/api";
import type { CliIntegration } from "../chat/generated/CliIntegration";
import type { CliIntegrations } from "../chat/generated/CliIntegrations";
import type { CliDetectionStatus } from "../chat/generated/CliDetectionStatus";
import type { CustomCliEntry } from "../chat/generated/CustomCliEntry";
import type { AssistantId } from "../chat/generated/AssistantId";
import { mergeDetection, enabledCount } from "../chat/cliIntegrationsUtils";
import { assistantKey } from "../chat/assistantId";
import { AddCliDialog, baseCommand } from "./AddCliDialog";
import { Dialog } from "./Dialog";
import { Toast } from "./Toast";
import { useI18n } from "../i18n/useI18n";
import type { Locale, TranslationKey } from "../i18n/types";

export interface CliIntegrationsSettingsProps {
  api: ChatApi;
  locale?: Locale;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; integrations: CliIntegrations }
  | { kind: "error"; message: string };

const MAX_ENABLED_CLIS = 3;

const BUILTIN_NAMES: Record<"codex" | "claude" | "gemini", string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
};

const STATUS_CLASS: Record<CliDetectionStatus, string> = {
  available: "cli-status--available",
  notInstalled: "cli-status--not-installed",
  notAuthenticated: "cli-status--not-authenticated",
  notDetected: "cli-status--not-detected",
};

const STATUS_KEY: Record<CliDetectionStatus, TranslationKey> = {
  available: "cli_statusAvailable",
  notInstalled: "cli_statusNotInstalled",
  notAuthenticated: "cli_statusNotAuthenticated",
  notDetected: "cli_statusNotDetected",
};

function loadingIntegrations(): CliIntegrations {
  const entry = (assistant: AssistantId): CliIntegration => ({
    assistant,
    enabled: false,
    detectedStatus: "notDetected",
  });
  return {
    codex: entry("codex"),
    claude: entry("claude"),
    gemini: entry("gemini"),
    custom: [],
  };
}

export function CliIntegrationsSettings({
  api,
  locale = "en",
}: CliIntegrationsSettingsProps) {
  const { t } = useI18n(locale);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [detecting, setDetecting] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Always-fresh reference used by handleRecheck to avoid stale closures across
  // async detection round-trips.
  const latestIntegrationsRef = useRef<CliIntegrations | null>(null);
  useEffect(() => {
    if (loadState.kind === "loaded") {
      latestIntegrationsRef.current = loadState.integrations;
    }
  }, [loadState]);

  useEffect(() => {
    let cancelled = false;
    api
      .getCliIntegrations()
      .then((integrations) => {
        if (!cancelled) setLoadState({ kind: "loaded", integrations });
      })
      .catch((err) => {
        if (!cancelled) setLoadState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const persist = useCallback(
    async (integrations: CliIntegrations) => {
      try {
        const saved = await api.updateCliIntegrations(integrations);
        setLoadState({ kind: "loaded", integrations: saved });
      } catch {
        setLoadState({ kind: "loaded", integrations });
      }
    },
    [api],
  );

  const handleToggleBuiltin = useCallback(
    async (assistant: "codex" | "claude" | "gemini", enabled: boolean) => {
      if (loadState.kind !== "loaded") return;
      if (enabled && enabledCount(loadState.integrations) >= MAX_ENABLED_CLIS) {
        setToast(t("cli_max3Toast"));
        return;
      }
      const next = structuredClone(loadState.integrations);
      next[assistant].enabled = enabled;
      setLoadState({ kind: "loaded", integrations: next });
      await persist(next);
    },
    [loadState, persist, t],
  );

  const handleToggleCustom = useCallback(
    async (name: string, enabled: boolean) => {
      if (loadState.kind !== "loaded") return;
      if (enabled && enabledCount(loadState.integrations) >= MAX_ENABLED_CLIS) {
        setToast(t("cli_max3Toast"));
        return;
      }
      const next = structuredClone(loadState.integrations);
      const entry = next.custom.find((e) => e.name === name);
      if (entry) entry.enabled = enabled;
      setLoadState({ kind: "loaded", integrations: next });
      await persist(next);
    },
    [loadState, persist, t],
  );

  const handleRecheck = useCallback(
    async (assistant: AssistantId) => {
      if (latestIntegrationsRef.current === null) return;
      const key = assistantKey(assistant);
      setDetecting((prev) => new Set(prev).add(key));
      try {
        const results = await api.detectClis();
        const match = results.find((r) => assistantKey(r.assistant) === key);
        if (match && latestIntegrationsRef.current !== null) {
          const next = mergeDetection(latestIntegrationsRef.current, [match]);
          setLoadState({ kind: "loaded", integrations: next });
          await persist(next);
        }
      } finally {
        setDetecting((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [api, persist],
  );

  const handleAddSave = useCallback(
    async (name: string, command: string) => {
      if (loadState.kind !== "loaded") {
        setShowAdd(false);
        return;
      }
      const next = structuredClone(loadState.integrations);
      const entry: CustomCliEntry = {
        name,
        command,
        // Starts enabled only if there is room under the global cap.
        enabled: enabledCount(next) < MAX_ENABLED_CLIS,
        detectedStatus: "notDetected",
      };
      next.custom.push(entry);
      setShowAdd(false);
      setLoadState({ kind: "loaded", integrations: next });
      await persist(next);
    },
    [loadState, persist],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      setDeleteTarget(null);
      if (loadState.kind !== "loaded") return;
      const next = structuredClone(loadState.integrations);
      next.custom = next.custom.filter((e) => e.name !== name);
      setLoadState({ kind: "loaded", integrations: next });
      await persist(next);
    },
    [loadState, persist],
  );

  const isLoaded = loadState.kind === "loaded";
  const isError = loadState.kind === "error";

  const integrations = isLoaded ? loadState.integrations : loadingIntegrations();
  const builtins = [integrations.codex, integrations.claude, integrations.gemini];

  const existingNames = integrations.custom.map((e) => e.name);
  const existingBaseCommands = integrations.custom.map((e) => baseCommand(e.command));

  return (
    <div className="cli-integrations-settings">
      <div className="cli-integrations-settings__header">
        <span className="cli-integrations-settings__cap-label">
          {t("cli_only3Label")}
        </span>
        <button
          type="button"
          className="settings-btn cli-integrations-settings__add"
          onClick={() => setShowAdd(true)}
          disabled={!isLoaded}
        >
          {t("cli_add")}
        </button>
      </div>

      {isError && (
        <p className="settings-pane__placeholder" data-testid="cli-integrations-error">
          {t("error")}
        </p>
      )}

      {builtins.map((item) => {
        const assistant = item.assistant as "codex" | "claude" | "gemini";
        const isAvailable = item.detectedStatus === "available";
        const isLoading = !isLoaded;
        const isDetecting = isLoading || detecting.has(assistantKey(item.assistant));

        return (
          <div key={assistantKey(item.assistant)} className="cli-integration-row">
            <span className="cli-integration-row__name">{BUILTIN_NAMES[assistant]}</span>

            <span
              className={`cli-status ${isDetecting ? "" : STATUS_CLASS[item.detectedStatus]}`}
              aria-label={
                isDetecting ? t("cli_detecting") : t(STATUS_KEY[item.detectedStatus])
              }
            >
              {isDetecting ? t("cli_detecting") : t(STATUS_KEY[item.detectedStatus])}
            </span>

            <label className="settings-toggle cli-integration-row__toggle">
              <input
                type="checkbox"
                checked={isLoaded && item.enabled && isAvailable}
                disabled={
                  !isLoaded || !isAvailable || detecting.has(assistantKey(item.assistant))
                }
                onChange={(e) => void handleToggleBuiltin(assistant, e.target.checked)}
              />
              <span />
            </label>

            <button
              type="button"
              className="settings-btn cli-integration-row__recheck"
              onClick={() => void handleRecheck(item.assistant)}
              disabled={!isLoaded || detecting.has(assistantKey(item.assistant))}
            >
              {t("cli_recheck")}
            </button>
          </div>
        );
      })}

      {integrations.custom.map((entry) => {
        const assistant: AssistantId = { custom: entry.name };
        const key = assistantKey(assistant);
        const isAvailable = entry.detectedStatus === "available";
        const isDetecting = !isLoaded || detecting.has(key);

        return (
          <div key={key} className="cli-integration-row cli-integration-row--custom">
            <span className="cli-integration-row__name">{entry.name}</span>

            <span
              className={`cli-status ${isDetecting ? "" : STATUS_CLASS[entry.detectedStatus]}`}
              aria-label={
                isDetecting ? t("cli_detecting") : t(STATUS_KEY[entry.detectedStatus])
              }
            >
              {isDetecting ? t("cli_detecting") : t(STATUS_KEY[entry.detectedStatus])}
            </span>

            <label className="settings-toggle cli-integration-row__toggle">
              <input
                type="checkbox"
                checked={isLoaded && entry.enabled && isAvailable}
                disabled={!isLoaded || !isAvailable || detecting.has(key)}
                onChange={(e) => void handleToggleCustom(entry.name, e.target.checked)}
              />
              <span />
            </label>

            <button
              type="button"
              className="settings-btn cli-integration-row__recheck"
              onClick={() => void handleRecheck(assistant)}
              disabled={!isLoaded || detecting.has(key)}
            >
              {t("cli_recheck")}
            </button>

            <button
              type="button"
              className="settings-btn cli-integration-row__delete"
              onClick={() => setDeleteTarget(entry.name)}
              disabled={!isLoaded || detecting.has(key)}
            >
              {t("cli_delete")}
            </button>
          </div>
        );
      })}

      {showAdd && isLoaded && (
        <AddCliDialog
          api={api}
          existingNames={existingNames}
          existingBaseCommands={existingBaseCommands}
          onSave={(name, command) => void handleAddSave(name, command)}
          onClose={() => setShowAdd(false)}
          locale={locale}
        />
      )}

      {deleteTarget !== null && (
        <Dialog label={t("cli_deleteDialogTitle")} onClose={() => setDeleteTarget(null)}>
          <p className="dialog__body">{t("cli_deleteConfirm", { name: deleteTarget })}</p>
          <div className="dialog__actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setDeleteTarget(null)}
            >
              {t("cli_cancel")}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--danger"
              onClick={() => void handleDelete(deleteTarget)}
            >
              {t("cli_delete")}
            </button>
          </div>
        </Dialog>
      )}

      {toast !== null && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
