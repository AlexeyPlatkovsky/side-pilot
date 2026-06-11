/**
 * Provider icons for the AI switcher (SP-017, SP-072).
 *
 * A built-in provider is shown as its brand logo PNG (`src/assets/`, transparent
 * backgrounds); a user-registered custom CLI has no bundled logo, so it shows a
 * letter badge (first character of its name). The `All` route is a 2×2 grid glyph.
 */

import type { AssistantId } from "../chat/generated/AssistantId";
import { type ActiveRoute } from "../chat/providers";
import { assistantKey, isCustomAssistant } from "../chat/assistantId";

import gptIcon from "../assets/chatgpt-128-transparent.png";
import claudeIcon from "../assets/claude-128-transparent.png";
import geminiIcon from "../assets/gemini-128-transparent.png";

const PROVIDER_ICONS: Record<string, string> = {
  codex: gptIcon,
  claude: claudeIcon,
  gemini: geminiIcon,
};

/**
 * A single provider's glyph: the brand logo for a built-in, or a letter badge
 * (first character of the name) for a user-registered custom CLI (SP-072), which
 * has no bundled icon.
 */
export function ProviderGlyph({ provider }: { provider: AssistantId }) {
  const key = assistantKey(provider);
  if (isCustomAssistant(provider)) {
    const initial = provider.custom.trim().charAt(0).toUpperCase() || "?";
    return (
      <span
        className="provider-icon provider-icon--custom"
        aria-hidden="true"
        data-provider={key}
      >
        {initial}
      </span>
    );
  }
  return (
    <img
      className="provider-icon provider-icon--logo"
      src={PROVIDER_ICONS[provider]}
      alt=""
      aria-hidden="true"
      data-provider={key}
    />
  );
}

/** The `All` route glyph — a 2×2 grid suggesting every provider at once. */
export function AllGlyph() {
  return (
    <span
      className="provider-icon provider-icon--all"
      aria-hidden="true"
      data-provider="all"
    >
      <span className="provider-icon__grid">
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

/** The icon for whichever route is active (drives the switcher button face). */
export function RouteIcon({ route }: { route: ActiveRoute }) {
  return route.kind === "all" ? (
    <AllGlyph />
  ) : (
    <ProviderGlyph provider={route.provider} />
  );
}
