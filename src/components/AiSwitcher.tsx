/**
 * AI switcher: a provider-logo button beside Send that opens a vertical picker
 * (SP-017). "All" sits at the top, followed by each provider; the active entry
 * is highlighted. The switcher is disabled while any response is in flight, so
 * the routing target cannot change mid-run.
 *
 * Accessibility: the button is a `menu` opener (`aria-haspopup`/`aria-expanded`);
 * options are `menuitemradio`s with `aria-checked`. Esc and outside-click close
 * the picker and return focus to the button. The Esc handler stops propagation
 * so it does not also trigger the bubble's Escape-collapse.
 *
 * WebKit: the picker is plain absolutely-positioned markup (no Popover API),
 * which renders consistently in the Tauri WKWebView.
 */

import { useEffect, useRef, useState } from "react";

import {
  type ActiveRoute,
  PROVIDERS,
  providerInfo,
  routesEqual,
} from "../chat/providers";
import { AllGlyph, ProviderGlyph, RouteIcon } from "./ProviderIcon";
import type { Locale } from "../i18n/types";
import { useI18n } from "../i18n/useI18n";
import type { AssistantId } from "../chat/generated/AssistantId";

export interface AiSwitcherProps {
  /** The currently selected route (single provider or All). */
  route: ActiveRoute;
  /** When true, the switcher cannot open (a response is in flight). */
  disabled: boolean;
  /** Called with the chosen route when the user picks an option. */
  onSelect: (route: ActiveRoute) => void;
  /** Current locale for translations. */
  locale?: Locale;
  /** Providers currently enabled. When provided, only enabled providers appear. */
  enabledProviders?: AssistantId[];
}

const ALL_ROUTE: ActiveRoute = { kind: "all" };

export function AiSwitcher({
  route,
  disabled,
  onSelect,
  locale = "en",
  enabledProviders,
}: AiSwitcherProps) {
  const { t } = useI18n(locale);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // A response starting mid-pick locks the picker closed without an effect:
  // visibility is derived, so `open` can stay set but never render while disabled.
  const menuOpen = open && !disabled;

  const visibleProviders =
    enabledProviders !== undefined
      ? PROVIDERS.filter((p) => enabledProviders.includes(p.id))
      : PROVIDERS;
  const hasAll = enabledProviders === undefined || enabledProviders.length > 1;

  // Close on outside click so the picker behaves like a normal menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  // Close on Escape. Captured at the document so it works regardless of focus,
  // and `stopPropagation` keeps Escape from also collapsing the bubble.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [menuOpen]);

  const choose = (next: ActiveRoute) => {
    onSelect(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const activeLabel =
    route.kind === "all" ? t("ai_all") : providerInfo(route.provider).label;

  return (
    <div className="ai-switcher" ref={containerRef}>
      {menuOpen && (
        <div
          className="ai-switcher__menu"
          role="menu"
          aria-label={t("ai_chooseProvider")}
        >
          {hasAll && (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={route.kind === "all"}
              className={`ai-switcher__option${route.kind === "all" ? " ai-switcher__option--active" : ""}`}
              onClick={() => choose(ALL_ROUTE)}
            >
              <AllGlyph />
              <span className="ai-switcher__option-label">{t("ai_all")}</span>
            </button>
          )}
          {visibleProviders.map((provider) => {
            const optionRoute: ActiveRoute = { kind: "single", provider: provider.id };
            const active = routesEqual(optionRoute, route);
            return (
              <button
                key={provider.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`ai-switcher__option${active ? " ai-switcher__option--active" : ""}`}
                onClick={() => choose(optionRoute)}
              >
                <ProviderGlyph provider={provider.id} />
                <span className="ai-switcher__option-label">{provider.label}</span>
              </button>
            );
          })}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className="ai-switcher__toggle"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t("ai_currentProvider", { label: activeLabel })}
        title={t("ai_title", { label: activeLabel })}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <RouteIcon route={route} />
      </button>
    </div>
  );
}
