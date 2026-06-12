Feature: Rust — extend CustomCliEntry struct, migration gate, remove base-command uniqueness, regenerate TS types
  As a developer I want the CustomCliEntry Rust struct to carry all new fields
  so that every subsequent task can build on a stable, serialized data shape

  Background:
    Given the app is compiled and preferences.json may contain legacy custom entries

  # ── Happy path ────────────────────────────────────────────────────────────────

  Scenario: New struct fields serialise and deserialise correctly
    Given preferences.json contains a custom entry with all new fields populated
    When the app loads and calls get_cli_integrations
    Then the returned CustomCliEntry carries label, cli_command, prompt_template,
         resume_session_flag, session_id_output_path, output_format,
         response_text_path, model_flag, and model_name with correct values

  Scenario: Fresh install — no preferences.json
    Given preferences.json does not exist
    When the app loads
    Then get_cli_integrations returns an empty custom Vec with no error

  # ── Migration gate ────────────────────────────────────────────────────────────

  Scenario: Existing custom entries are wiped silently on first launch after upgrade
    Given preferences.json contains legacy custom entries that pre-date SP-073
    And the stored entries lack the shape_version field expected by SP-073
    When the app loads
    Then the custom Vec is cleared silently
    And no error or notification is shown to the user

  Scenario: Corrupt preferences.json handled by existing error path
    Given preferences.json contains malformed JSON
    When the app loads
    Then the existing error-handling path fires (no new panic or crash)
    And the CLI Integrations pane shows only the three built-in rows

  # ── Base-command uniqueness removed ──────────────────────────────────────────

  Scenario: Two custom entries with the same cli_command are accepted
    Given no custom CLI named "opencode-work" or "opencode-personal" exists
    When the user saves "opencode-work" with cli_command "opencode"
    And the user saves "opencode-personal" with cli_command "opencode"
    Then both entries are persisted without a validation error

  Scenario: Reserved base-command check still fires for claude/codex/gemini
    Given the user opens the Add dialog
    When the user enters cli_command "claude"
    Then an inline validation error indicates "claude" is a reserved command
    And the Save button is disabled

  # ── Label uniqueness ──────────────────────────────────────────────────────────

  Scenario: Duplicate label rejected
    Given a custom CLI with label "My Tool" already exists
    When the user attempts to save a second entry also labeled "My Tool"
    Then the Rust validate_custom layer returns a label-already-in-use error

  Scenario: Same label accepted on edit of the same entry
    Given a custom CLI with label "My Tool" is being edited
    When the user saves without changing the label
    Then no label-uniqueness error fires

  # ── TS type regeneration ──────────────────────────────────────────────────────

  Scenario: Generated TypeScript type matches the new Rust struct
    Given the Rust struct has been updated with all new fields
    When ts-rs regenerates src/chat/generated/CustomCliEntry.ts
    Then the TypeScript type contains label, cliCommand, promptTemplate,
         resumeSessionFlag, sessionIdOutputPath, outputFormat,
         responseTextPath, modelFlag, and modelName

  # ── Field length validation ───────────────────────────────────────────────────

  Scenario: label max length enforced at 32 chars
    Given the user enters a label of 33 characters
    Then a validation error fires and Save is disabled

  Scenario: All other string fields max length enforced at 64 chars
    Given the user enters a promptTemplate of 65 characters
    Then a validation error fires and Save is disabled

  Scenario: Empty mandatory fields rejected at save time
    Given the user leaves prompt_template empty (a mandatory field)
    When the user attempts to save
    Then the Rust validation layer returns a missing-required-field error
