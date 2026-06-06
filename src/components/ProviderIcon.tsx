/**
 * Provider icons for the AI switcher (SP-017).
 *
 * Each provider is shown as a small accent-colored monogram chip; the `All`
 * route is a 2×2 grid glyph. These are lightweight CSS/text marks (not brand
 * SVG logos) so there is no trademarked-asset dependency; the accent color is
 * tokenized in `styles.css`.
 */

import type { AssistantId } from "../chat/generated/AssistantId";
import { type ActiveRoute, providerInfo } from "../chat/providers";

/** A single provider's monogram chip. */
export function ProviderGlyph({ provider }: { provider: AssistantId }) {
  const info = providerInfo(provider);
  return (
    <span
      className={`provider-icon provider-icon--${info.accent}`}
      aria-hidden="true"
      data-provider={info.id}
    >
      {info.glyph}
    </span>
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
