Feature: Frontend — expand Add/Edit dialog with all new fields
  As a user I want the Add/Edit CLI dialog to expose all new configuration fields
  so that I can configure any CLI provider precisely without leaving the app

  # ── Dialog opens with correct default state ───────────────────────────────────

  Scenario: Add dialog opens with Custom selected and all fields empty
    Given no custom CLI entry is being edited
    When the user clicks the Add button in CLI Integrations settings
    Then the provider dropdown shows "Custom" selected
    And all fields (label, cli_command, prompt_template, resume_session_flag,
        session_id_output_path, output_format, response_text_path,
        model_flag, model_name) are empty

  Scenario: Add dialog opens with mandatory fields highlighted
    Given the Add dialog is open
    Then label, cli_command, prompt_template, and output_format show as required
    And model_flag and model_name are visually marked as optional

  # ── Provider dropdown — predefined auto-fill ─────────────────────────────────

  Scenario: Selecting predefined provider fills all fields
    Given the Add dialog is open with "Custom" selected
    When the user selects "opencode" from the provider dropdown
    Then all fields auto-fill with opencode defaults
    And all fields remain editable

  Scenario: Switching from one predefined to another overwrites all fields
    Given the user previously selected "opencode" (fields auto-filled)
    When the user selects "qwen" from the dropdown
    Then all fields overwrite to qwen defaults

  Scenario: Switching back to Custom clears all fields
    Given the user previously selected "opencode" (fields auto-filled)
    When the user selects "Custom" from the dropdown
    Then all fields are cleared

  # ── Edit dialog pre-fill ──────────────────────────────────────────────────────

  Scenario: Edit dialog opens pre-filled with saved values
    Given a custom CLI entry "My Tool" was saved with specific field values
    When the user clicks the pencil icon on the "My Tool" row
    Then the dialog opens with all fields pre-filled from the saved entry
    And the provider dropdown shows "Custom" (since it was a custom entry)

  # ── Validation — Save button gating ──────────────────────────────────────────

  Scenario: Save and Test buttons disabled until all mandatory fields filled
    Given the Add dialog is open
    When any mandatory field is empty
    Then both Save and Test buttons are disabled
    When all mandatory fields are non-empty
    Then both Save and Test buttons become enabled

  Scenario: Duplicate label inline error
    Given a custom CLI labeled "My Tool" already exists
    When the user types "My Tool" in the label field
    Then an inline "Label already in use" error appears
    And Save is disabled

  Scenario: Editing own label is not treated as duplicate
    Given the Edit dialog is open for an entry currently labeled "My Tool"
    When the user saves without changing the label
    Then no duplicate-label error fires

  Scenario: Label over 32 characters shows inline error
    Given the Add dialog is open
    When the user types 33 characters in the label field
    Then an inline max-length error appears and Save is disabled

  Scenario: Any other field over 64 characters shows inline error
    Given the Add dialog is open
    When the user types 65 characters in the prompt_template field
    Then an inline max-length error appears and Save is disabled

  # ── Dialog sizing ─────────────────────────────────────────────────────────────

  Scenario: Dialog is taller than the original 2-field dialog
    Given the Add dialog is open
    Then the dialog height accommodates all fields without a scrollbar
    And the dialog is visually larger than the pre-SP-073 Add dialog

  # ── output_format selector ────────────────────────────────────────────────────

  Scenario: output_format defaults to plain for Custom provider
    Given the Add dialog is open with "Custom" selected
    Then the output_format selector defaults to "plain"

  Scenario: response_text_path field hidden when output_format is plain
    Given output_format is set to "plain"
    Then the response_text_path field is hidden or disabled

  Scenario: response_text_path field visible when output_format is json or jsonl
    Given output_format is set to "json"
    Then the response_text_path field is visible and required
    When output_format is changed to "jsonl"
    Then response_text_path remains visible and required

  # ── Test button behavior ──────────────────────────────────────────────────────

  Scenario: Test button in Add dialog runs CLI with "hello" as placeholder prompt
    Given the Add dialog is open with a valid cli_command and prompt_template
    When the user clicks Test
    Then all dialog buttons are disabled while the test is in-flight
    And the adapter runs the CLI with "hello" substituted into {prompt}

  Scenario: Test success for plain output format
    Given output_format is "plain"
    And the CLI exits with code 0 and non-empty stdout
    When the test completes
    Then a success indicator is shown
    And dialog buttons re-enable

  Scenario: Test success for json output format requires parseable JSON
    Given output_format is "json" and response_text_path "$.result"
    And the CLI exits with code 0 and returns parseable JSON containing "result"
    When the test completes
    Then a success indicator is shown

  Scenario: Test failure for json output — non-parseable output
    Given output_format is "json"
    And the CLI returns plain text instead of JSON
    When the test completes
    Then "Ensure that CLI tool is installed and authenticated" is shown
    And dialog buttons re-enable

  Scenario: Test failure — CLI not found
    Given cli_command is "nonexistent-cli"
    When the user clicks Test
    Then "Ensure that CLI tool is installed and authenticated" is shown

  Scenario: Test timeout after 30 seconds
    Given the CLI process hangs
    When 30 seconds elapse
    Then the dialog shows "Test timed out"
    And dialog buttons re-enable
