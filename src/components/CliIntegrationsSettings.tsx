import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatApi } from "../chat/api";
import type { CliIntegration } from "../chat/generated/CliIntegration";
import type { CliIntegrations } from "../chat/generated/CliIntegrations";
import type { CliDetectionStatus } from "../chat/generated/CliDetectionStatus";
import type { AssistantId } from "../chat/generated/AssistantId";
import { mergeDetection, findEntry } from "../chat/cliIntegrationsUtils";
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

const PROVIDER_NAMES: Record<AssistantId, string> = {
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
  };
}

export function CliIntegrationsSettings({
  api,
  locale = "en",
}: CliIntegrationsSettingsProps) {
  const { t } = useI18n(locale);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [detecting, setDetecting] = useState<Set<AssistantId>>(new Set());

  // Always-fresh reference used by handleRecheck to avoid stale closures across
  // async detection round-trips (up to 10 s).
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

  const handleToggle = useCallback(
    async (assistant: AssistantId, enabled: boolean) => {
      if (loadState.kind !== "loaded") return;
      const next = toggleIntegration(loadState.integrations, assistant, enabled);
      setLoadState({ kind: "loaded", integrations: next });
      await persist(next);
    },
    [loadState, persist],
  );

  const handleRecheck = useCallback(
    async (assistant: AssistantId) => {
      if (latestIntegrationsRef.current === null) return;
      setDetecting((prev) => new Set(prev).add(assistant));
      try {
        const results = await api.detectClis();
        const match = results.find((r) => r.assistant === assistant);
        // Read the ref after the await to get the latest state, not the stale closure.
        if (match && latestIntegrationsRef.current !== null) {
          const next = mergeDetection(latestIntegrationsRef.current, [match]);
          setLoadState({ kind: "loaded", integrations: next });
          await persist(next);
        }
      } finally {
        setDetecting((prev) => {
          const next = new Set(prev);
          next.delete(assistant);
          return next;
        });
      }
    },
    [api, persist],
  );

  const isLoaded = loadState.kind === "loaded";
  const isError = loadState.kind === "error";

  // During loading, show the full list with "Detecting..." on every row.
  // On error, show the error banner.
  const integrations = isLoaded ? loadState.integrations : loadingIntegrations();
  const all = [integrations.codex, integrations.claude, integrations.gemini];

  return (
    <div className="cli-integrations-settings">
      {isError && (
        <p className="settings-pane__placeholder" data-testid="cli-integrations-error">
          {t("error")}
        </p>
      )}
      {all.map((item) => {
        const isAvailable = item.detectedStatus === "available";
        const isLoading = !isLoaded;
        const isDetecting = isLoading || detecting.has(item.assistant);

        return (
          <div key={item.assistant} className="cli-integration-row">
            <span className="cli-integration-row__name">
              {PROVIDER_NAMES[item.assistant]}
            </span>

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
                disabled={!isLoaded || !isAvailable || detecting.has(item.assistant)}
                onChange={(e) => void handleToggle(item.assistant, e.target.checked)}
              />
              <span />
            </label>

            <button
              type="button"
              className="settings-btn cli-integration-row__recheck"
              onClick={() => void handleRecheck(item.assistant)}
              disabled={!isLoaded || detecting.has(item.assistant)}
            >
              {t("cli_recheck")}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function toggleIntegration(
  integrations: CliIntegrations,
  assistant: AssistantId,
  enabled: boolean,
): CliIntegrations {
  const next = structuredClone(integrations);
  const entry = findEntry(next, assistant);
  if (entry) entry.enabled = enabled;
  return next;
}
