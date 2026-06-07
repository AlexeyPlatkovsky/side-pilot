/**
 * Provider icons for the AI switcher (SP-017).
 *
 * Each provider is shown as its brand logo PNG; the `All` route is a 2×2 grid
 * glyph. Icons live in `src/assets/` with transparent backgrounds.
 */

import type { AssistantId } from "../chat/generated/AssistantId";
import { type ActiveRoute } from "../chat/providers";

import gptIcon from "../assets/chatgpt-128-transparent.png";
import claudeIcon from "../assets/claude-128-transparent.png";
import geminiIcon from "../assets/gemini-128-transparent.png";

const PROVIDER_ICONS: Record<string, string> = {
  codex: gptIcon,
  claude: claudeIcon,
  gemini: geminiIcon,
};

/** A single provider's logo image. */
export function ProviderGlyph({ provider }: { provider: AssistantId }) {
  const src = PROVIDER_ICONS[provider];
  return (
    <img
      className="provider-icon provider-icon--logo"
      src={src}
      alt=""
      aria-hidden="true"
      data-provider={provider}
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
