Feature: Custom CLI provider — add, test, route, and delete
  As a user I want to register my own CLI tools as AI providers
  so that I can route prompts to any local CLI that accepts a prompt via stdin

  # ── Add flow ───────────────────────────────────────────────────────────────

  Scenario: Add and use a custom CLI end-to-end
    Given the CLI Integrations pane is open
    And fewer than 3 CLIs are currently enabled
    When the user clicks the "Add" button
    And enters name "OpenCode" and CLI Prompt Command "opencode --prompt"
    And clicks "Test" which succeeds (exit 0, non-empty stdout)
    And clicks "Save"
    Then a new row "OpenCode" appears with status "Available" and toggle enabled
    And "OpenCode" appears in the AI switcher
    And sending a prompt to "OpenCode" routes to the process via stdin
    And the process stdout is displayed as the reply

  Scenario: Save without testing
    Given the Add dialog is open
    And both the CLI name and CLI Prompt Command fields are filled
    When the user clicks "Save" without clicking "Test"
    Then the entry is persisted to preferences.json
    And the row appears in the pane
    And the detection status reflects the result of startup detection on next launch

  # ── Test button behaviour ──────────────────────────────────────────────────

  Scenario: Test fails — binary not found
    Given the Add dialog is open
    When the user enters CLI Prompt Command "nonexistent-cli"
    And clicks "Test"
    Then all dialog buttons are disabled while the test is in-flight
    And after the test completes the dialog shows "Ensure that CLI tool is installed and authenticated"
    And all dialog buttons re-enable so the user can edit and retry

  Scenario: Test fails — empty stdout
    Given the Add dialog is open
    And the CLI process exits with code 0 but produces no stdout
    When the user clicks "Test"
    Then all dialog buttons are disabled while the test is in-flight
    And after completion the dialog shows "Ensure that CLI tool is installed and authenticated"
    And all dialog buttons re-enable

  Scenario: Test times out
    Given the Add dialog is open
    And the CLI process hangs without producing output
    When 30 seconds elapse after the user clicks "Test"
    Then the dialog shows "Test timed out"
    And all dialog buttons re-enable

  Scenario: Test and Save buttons disabled until both fields filled
    Given the Add dialog is open
    When either the CLI name or CLI Prompt Command field is empty
    Then the Test and Save buttons are disabled
    When both fields contain at least one character
    Then the Test and Save buttons become enabled

  # ── Validation ────────────────────────────────────────────────────────────

  Scenario: Duplicate name rejected
    Given a custom CLI named "OpenCode" already exists
    When the user opens the Add dialog
    And enters name "OpenCode"
    Then an inline validation error "Name already in use" is shown
    And the Save button is disabled

  Scenario: Duplicate base command rejected
    Given a custom CLI with command "opencode --prompt" already exists
    When the user opens the Add dialog
    And enters CLI Prompt Command "opencode --stream"
    Then an inline validation error is shown indicating "opencode" is already registered
    And the Save button is disabled

  Scenario: Reserved base command rejected
    Given the user opens the Add dialog
    When the user enters CLI Prompt Command "codex --myprompt"
    Then an inline validation error is shown indicating "codex" is a reserved command
    And the Save button is disabled

  # ── Max-3 enforcement ─────────────────────────────────────────────────────

  Scenario: New entry saved as disabled when 3 CLIs are already enabled
    Given Codex, Claude, and Gemini are all enabled
    When the user adds a custom CLI "OpenCode" via the Add dialog
    Then the "OpenCode" row appears with toggle disabled
    And the total number of enabled CLIs remains 3

  Scenario: Max-3 enforcement on toggle
    Given Codex, Claude, and Gemini are all enabled
    And a custom CLI "OpenCode" is saved and currently disabled
    When the user clicks the "OpenCode" toggle to enable it
    Then a 3-second auto-dismissing toast appears with "Only 3 CLIs can be enabled at a time"
    And the "OpenCode" toggle remains unchecked

  Scenario: Constant label visible above all rows
    Given the CLI Integrations pane is open
    Then a label "Only 3 CLIs can be enabled at a time" is visible above the provider rows

  # ── Delete flow ───────────────────────────────────────────────────────────

  Scenario: Delete custom CLI preserves chat history
    Given a custom CLI "OpenCode" has been used in chat (messages exist in the transcript)
    When the user clicks "Delete" on the "OpenCode" row
    And the confirmation dialog appears with "Delete" and "Cancel" buttons
    And the user clicks "Delete"
    Then the "OpenCode" row is removed from the CLI Integrations pane
    And "OpenCode" no longer appears in the AI switcher
    And existing "OpenCode" messages remain visible in the chat transcript

  Scenario: Delete cancelled leaves entry intact
    Given a custom CLI "OpenCode" exists
    When the user clicks "Delete" on the "OpenCode" row
    And the user clicks "Cancel" in the confirmation dialog
    Then the "OpenCode" row remains in the pane
    And "OpenCode" remains in the AI switcher if it was enabled

  Scenario: Delete button absent on built-in rows
    Given the CLI Integrations pane is open
    Then the Codex row has no "Delete" button
    And the Claude row has no "Delete" button
    And the Gemini row has no "Delete" button

  # ── Re-check ─────────────────────────────────────────────────────────────

  Scenario: Re-check updates status with whole-app block
    Given a custom CLI "OpenCode" row shows status "Not detected"
    And the CLI is now installed and responding
    When the user clicks "Re-check" on the "OpenCode" row
    Then the whole app shows a global spinner and is non-interactive
    And after detection completes the "OpenCode" row shows status "Available"
    And the toggle becomes enabled

  # ── Not-detected state ────────────────────────────────────────────────────

  Scenario: Not-detected custom CLI excluded from AI switcher
    Given a custom CLI "MyTool" has status "Not detected"
    Then the "MyTool" toggle is disabled
    And "MyTool" does not appear in the AI switcher
    And "MyTool" is not included in "All" routing

  # ── Routing ───────────────────────────────────────────────────────────────

  Scenario: Custom CLI routing failure produces inline error card
    Given a custom CLI "OpenCode" is enabled and selected in the AI switcher
    And the CLI process exits with a non-zero code
    When the user sends a prompt
    Then an inline error card appears in the transcript for "OpenCode"
    And the error card uses the existing error-card component (no new UI)

  # ── Startup detection ─────────────────────────────────────────────────────

  Scenario: Startup detection of custom CLIs
    Given preferences.json contains two custom CLIs "ToolA" and "ToolB"
    When the app launches
    Then the whole app shows a global spinner during concurrent detection of all CLIs
    And when the CLI Integrations pane is opened
    Then both "ToolA" and "ToolB" rows show their correct detection status badges

  # ── Persistence ───────────────────────────────────────────────────────────

  Scenario: Custom CLIs persist across app restart
    Given the user has added a custom CLI "OpenCode" and it is enabled
    When the app is restarted
    Then the "OpenCode" row is present in the CLI Integrations pane with its previous toggle state

  Scenario: Existing preferences.json without custom CLIs loads without error
    Given a preferences.json file that was created before this feature (no custom CLI field)
    When the app launches
    Then no error occurs
    And the CLI Integrations pane shows only the three built-in rows with no custom entries
