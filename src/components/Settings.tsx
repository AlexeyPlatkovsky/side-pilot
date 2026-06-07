import { useState, useCallback, type KeyboardEvent } from "react";

export type SettingsSection =
  | "api-keys"
  | "cli-integrations"
  | "themes"
  | "general"
  | "keyboard-shortcuts"
  | "account"
  | "about";

interface SectionDef {
  id: SettingsSection;
  label: string;
}

const SECTIONS: SectionDef[] = [
  { id: "api-keys", label: "API Keys" },
  { id: "cli-integrations", label: "CLI Integrations" },
  { id: "themes", label: "Themes" },
  { id: "general", label: "General" },
  { id: "keyboard-shortcuts", label: "Keyboard Shortcuts" },
  { id: "account", label: "Account" },
  { id: "about", label: "About" },
];

/**
 * Settings view shell with a left section rail and an active-content pane
 * (SP-029, SP-031). Each pane is an empty placeholder for this task; later
 * tasks fill them with actual settings controls. Keyboard navigation follows
 * the ARIA Tabs pattern: Arrow Up / Down move between tabs with wrapping,
 * Home / End jump to first / last.
 */
export function Settings() {
  const [active, setActive] = useState<SettingsSection>("api-keys");

  const select = useCallback((section: SettingsSection) => {
    setActive(section);
    document.getElementById(tabId(section))?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const idx = SECTIONS.findIndex((s) => s.id === active);
      let next: SettingsSection;
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          next = SECTIONS[(idx + 1) % SECTIONS.length].id;
          break;
        case "ArrowUp":
          event.preventDefault();
          next = SECTIONS[(idx - 1 + SECTIONS.length) % SECTIONS.length].id;
          break;
        case "Home":
          event.preventDefault();
          next = SECTIONS[0].id;
          break;
        case "End":
          event.preventDefault();
          next = SECTIONS[SECTIONS.length - 1].id;
          break;
        default:
          return;
      }
      setActive(next);
      document.getElementById(tabId(next))?.focus();
    },
    [active],
  );

  return (
    <div className="settings-view">
      <div
        role="tablist"
        aria-label="Settings sections"
        aria-orientation="vertical"
        className="settings-rail"
      >
        {SECTIONS.map((section) => {
          const selected = active === section.id;
          return (
            <button
              key={section.id}
              type="button"
              id={tabId(section.id)}
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(section.id)}
              tabIndex={selected ? 0 : -1}
              className={`settings-rail__item${selected ? " settings-rail__item--active" : ""}`}
              onClick={() => select(section.id)}
              onKeyDown={handleKeyDown}
            >
              {section.label}
            </button>
          );
        })}
      </div>
      <div className="settings-pane">
        {SECTIONS.map((section) => {
          const selected = active === section.id;
          return (
            <div
              key={section.id}
              id={panelId(section.id)}
              role="tabpanel"
              aria-labelledby={tabId(section.id)}
              tabIndex={0}
              hidden={!selected}
              className="settings-pane__content"
            >
              <h2 className="settings-pane__title">{section.label}</h2>
              <p className="settings-pane__placeholder">
                {section.label} settings arrive in a future update.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tabId(section: SettingsSection): string {
  return `settings-tab-${section}`;
}

function panelId(section: SettingsSection): string {
  return `settings-panel-${section}`;
}
