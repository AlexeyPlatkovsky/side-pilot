Feature: Frontend — warning badge and hover tooltip for session-less CLIs
  As a user I want to see a warning when a CLI entry lacks session tracking
  so that I understand it sends full chat history on every request

  # ── Badge visibility ──────────────────────────────────────────────────────────

  Scenario: Warning badge visible on row with empty session_id_output_path
    Given a custom CLI entry has session_id_output_path ""
    When the CLI Integrations pane is open
    Then a warning icon is visible alongside the entry's label

  Scenario: No warning badge on row with populated session_id_output_path
    Given a custom CLI entry has session_id_output_path "$.session_id"
    When the CLI Integrations pane is open
    Then no warning icon is shown on that row

  Scenario: Warning badge visible on predefined amp entry (partial CLI)
    Given the user has saved an "amp" entry using the predefined template
    Then the amp row shows the warning badge
    Because amp's predefined template has an empty session_id_output_path

  Scenario: No warning badge on opencode row (has session tracking)
    Given the user has saved an "opencode" entry using the predefined template
    Then the opencode row shows no warning badge
    Because opencode's predefined template has a populated session_id_output_path

  # ── Tooltip content ────────────────────────────────────────────────────────────

  Scenario: Hovering warning badge shows explanation tooltip
    Given a row has the warning badge
    When the user hovers the warning icon
    Then a tooltip appears containing "Sends full chat history on every request"

  Scenario: Tooltip dismisses on mouse-out
    Given the warning badge tooltip is visible
    When the user moves the mouse away from the icon
    Then the tooltip disappears

  # ── Badge in AI switcher ──────────────────────────────────────────────────────

  Scenario: Warning badge also appears in AI switcher for session-less CLIs
    Given a session-less CLI is enabled and appears in the AI switcher
    Then the warning icon is visible next to its name in the switcher

  # ── SP-072 regression ────────────────────────────────────────────────────────

  Scenario: Existing plain-output CLIs migrated from SP-072 show warning badge
    Given a legacy custom entry from SP-072 has an empty session_id_output_path
    (after migration its other new fields are populated with sensible defaults)
    When the CLI Integrations pane is open
    Then the warning badge is shown on that entry's row
