Feature: QA — Test button updates and runtime UI validation
  As a developer I want the Test button to validate structured output correctly
  and runtime errors to appear as typed cards in the chat transcript

  # ── Test button — plain format (existing behavior) ───────────────────────────

  Scenario: Test plain-format CLI succeeds on exit 0 + non-empty stdout
    Given output_format is "plain"
    And the CLI exits with code 0 and produces non-empty stdout
    When the user clicks Test
    Then a success indicator is shown in the dialog

  Scenario: Test plain-format CLI fails on non-zero exit
    Given output_format is "plain"
    And the CLI exits with a non-zero code
    When the user clicks Test
    Then "Ensure that CLI tool is installed and authenticated" is shown

  Scenario: Test plain-format CLI fails on empty stdout
    Given output_format is "plain"
    And the CLI exits with code 0 but produces no output
    When the user clicks Test
    Then "Ensure that CLI tool is installed and authenticated" is shown

  # ── Test button — json format ─────────────────────────────────────────────────

  Scenario: Test json-format CLI succeeds when output is valid JSON with required key
    Given output_format is "json" and response_text_path "$.result"
    And the CLI returns valid JSON containing a "result" key
    When the user clicks Test
    Then a success indicator is shown

  Scenario: Test json-format CLI fails when output is not parseable JSON
    Given output_format is "json"
    And the CLI returns plain text
    When the user clicks Test
    Then "Ensure that CLI tool is installed and authenticated" is shown

  Scenario: Test json-format CLI fails when response_text_path key is absent
    Given output_format is "json" and response_text_path "$.result"
    And the CLI returns valid JSON that does not contain a "result" key
    When the user clicks Test
    Then "Ensure that CLI tool is installed and authenticated" is shown

  # ── Test button — jsonl format ────────────────────────────────────────────────

  Scenario: Test jsonl-format CLI succeeds when at least one line yields the response key
    Given output_format is "jsonl" and response_text_path "$.message.content.text"
    And the CLI emits at least one JSONL line matching the path
    When the user clicks Test
    Then a success indicator is shown

  Scenario: Test jsonl-format CLI fails when no JSONL lines yield the response key
    Given output_format is "jsonl" and response_text_path "$.message.content.text"
    And no emitted line contains the expected structure
    When the user clicks Test
    Then "Ensure that CLI tool is installed and authenticated" is shown

  # ── Test button — buttons disabled during test ────────────────────────────────

  Scenario: All dialog buttons disabled while test is in-flight
    Given the user has clicked Test
    Then Save, Test, and Cancel buttons are all disabled
    And a loading indicator is visible
    When the test completes
    Then all buttons are re-enabled

  # ── Test timeout ──────────────────────────────────────────────────────────────

  Scenario: Test timeout after 30 seconds
    Given the CLI process hangs without producing output
    When 30 seconds elapse after the user clicks Test
    Then "Test timed out" is shown in the dialog
    And all dialog buttons re-enable

  # ── Test on Edit dialog ───────────────────────────────────────────────────────

  Scenario: Test button in Edit dialog behaves identically to Add dialog
    Given the Edit dialog is open for an existing entry
    When the user clicks Test
    Then the adapter runs the CLI with the current field values
    And success/failure indicators follow the same rules as the Add dialog

  # ── Runtime errors in chat transcript ────────────────────────────────────────

  Scenario: response_text_path extraction failure shows typed error card
    Given a custom CLI is enabled and selected in the AI switcher
    And the CLI returns JSON that does not contain the configured response_text_path key
    When the user sends a prompt
    Then a typed error card appears in the transcript
    And no plain-text reply is shown

  Scenario: session_id extraction failure shows warning in transcript, not error card
    Given a custom CLI with session_id_output_path "$.session_id" is enabled
    And the CLI returns JSON without a "session_id" key
    When the user sends a prompt
    Then the reply text is displayed normally
    And a non-blocking warning message appears below the reply

  Scenario: CLI process exits non-zero at runtime shows error card
    Given a custom CLI is enabled and selected in the AI switcher
    And the CLI exits with a non-zero code during a real prompt
    When the user sends a prompt
    Then an inline error card appears in the transcript (existing component, no new UI)

  # ── SP-072 regression ────────────────────────────────────────────────────────

  Scenario: Existing plain-format SP-072 CLIs still work after SP-073 changes
    Given a legacy custom CLI from SP-072 with output_format "plain"
    When the user sends a prompt to that CLI
    Then the CLI runs and the stdout is displayed as the reply
    And no extraction errors occur
