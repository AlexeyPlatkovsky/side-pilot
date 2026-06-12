Feature: Frontend — built-in CLI edit dialog (model_name only)
  As a user I want to update the model name used for Claude, Codex, or Gemini
  so that I can switch to a different model version without losing other settings

  # ── Dialog form shape ─────────────────────────────────────────────────────────

  Scenario: Built-in edit dialog shows model_name as the only editable field
    Given the user clicks the pencil icon on the Claude row
    Then the dialog title is "Edit Claude"
    And a model_name input field is visible and editable
    And all other fields (cli_command, prompt_template, etc.) are either absent
        or displayed as read-only labels

  Scenario: model_name pre-filled from ProviderPreferences on dialog open
    Given ProviderPreferences stores "claude-sonnet-4-6" for Claude
    When the user opens the Claude edit dialog
    Then the model_name field shows "claude-sonnet-4-6"

  Scenario: model_name field empty when no value stored in ProviderPreferences
    Given ProviderPreferences has no model_name for Codex
    When the user opens the Codex edit dialog
    Then the model_name field is empty

  # ── Save ──────────────────────────────────────────────────────────────────────

  Scenario: Saving a new model_name calls update_provider_preferences
    Given the Claude edit dialog is open
    When the user types "claude-opus-4-8" and clicks Save
    Then the update_provider_preferences IPC is called with model "claude-opus-4-8" for Claude
    And the dialog closes

  Scenario: Saving an empty model_name removes the override
    Given the Codex edit dialog shows "codex-mini" in model_name
    When the user clears the field and clicks Save
    Then the update_provider_preferences IPC is called with an empty or null model for Codex

  Scenario: Cancel does not call any IPC
    Given the Gemini edit dialog is open
    When the user types a value and clicks Cancel
    Then no IPC call is made
    And the existing ProviderPreferences value is unchanged

  # ── Row reflects saved model_name ─────────────────────────────────────────────

  Scenario: Claude row shows updated model_name after save
    Given the user saved "claude-opus-4-8" via the Claude edit dialog
    When the CLI Integrations pane refreshes
    Then the Claude row displays "claude-opus-4-8" as the model identifier

  # ── No delete option ──────────────────────────────────────────────────────────

  Scenario: Built-in edit dialog has no Delete button
    Given the Claude edit dialog is open
    Then no Delete button is present in the dialog

  # ── Field length ──────────────────────────────────────────────────────────────

  Scenario: model_name longer than 64 characters shows inline error
    Given the Claude edit dialog is open
    When the user types a model name of 65 characters
    Then an inline max-length error appears and Save is disabled
