Feature: Frontend — Edit (pencil) button on each CLI row
  As a user I want to click a pencil icon on any row to edit its settings
  so that I can update a CLI configuration without deleting and re-adding it

  # ── Pencil icon presence ──────────────────────────────────────────────────────

  Scenario: Pencil icon present on all custom CLI rows
    Given a custom CLI "My Tool" exists in the CLI Integrations pane
    Then a pencil icon button is visible on the "My Tool" row

  Scenario: Pencil icon present on built-in rows (claude, codex, gemini)
    Given the CLI Integrations pane is open
    Then the Claude row has a pencil icon
    And the Codex row has a pencil icon
    And the Gemini row has a pencil icon

  Scenario: Delete icon absent on built-in rows
    Given the CLI Integrations pane is open
    Then the Claude row has no Delete button
    And the Codex row has no Delete button
    And the Gemini row has no Delete button

  # ── Edit dialog opens pre-filled ─────────────────────────────────────────────

  Scenario: Clicking pencil on custom row opens Edit dialog pre-filled
    Given a custom CLI "My Tool" with specific values is in the pane
    When the user clicks the pencil icon on the "My Tool" row
    Then the Edit dialog opens with all fields populated from "My Tool"'s saved values

  Scenario: Clicking pencil on built-in Claude row opens model_name-only dialog
    Given the Claude row is in the pane
    When the user clicks the pencil icon
    Then the Edit dialog opens with only the model_name field editable
    And all other fields are displayed as read-only

  # ── Save from Edit dialog ─────────────────────────────────────────────────────

  Scenario: Saving edit from custom row updates the entry
    Given the Edit dialog is open for "My Tool"
    When the user changes label to "My Tool v2" and clicks Save
    Then the pane row updates to show "My Tool v2"
    And the change is persisted to preferences.json via update_cli_integrations IPC

  Scenario: Cancelling edit leaves entry unchanged
    Given the Edit dialog is open for "My Tool"
    When the user clicks Cancel
    Then the row remains unchanged
    And no IPC call is made

  # ── Row icon layout ───────────────────────────────────────────────────────────

  Scenario: Custom row shows recheck, pencil, and delete icons in that order
    Given a custom CLI row is visible
    Then the row action icons are: re-check, pencil, delete

  Scenario: Built-in row shows only pencil icon (no recheck, no delete)
    Given a built-in CLI row is visible
    Then only the pencil icon is visible in the row's action area
