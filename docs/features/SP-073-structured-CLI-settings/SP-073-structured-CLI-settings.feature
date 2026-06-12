Feature: Structured CLI settings — predefined provider catalog, session tracking, and rich command configuration
  As a user I want to add major AI CLIs without researching their command syntax
  so that side-pilot can route prompts to them with proper output parsing and session continuity

  # ── Add flow ─────────────────────────────────────────────────────────────────

  Scenario: Add CLI using predefined provider
    Given the CLI Integrations pane is open
    When the user clicks Add and selects "opencode" from the provider dropdown
    Then all mandatory fields auto-fill with opencode defaults
    When the user clicks Save
    Then a row named "opencode" appears with recheck, edit, and delete icons
    And "opencode" appears in the AI switcher

  Scenario: Switching provider dropdown always overwrites including back to Custom
    Given the Add dialog is open with "opencode" selected and fields auto-filled
    When the user switches the dropdown to "Custom"
    Then all fields are cleared
    When the user switches to "qwen"
    Then all fields overwrite to qwen defaults

  # ── Warning badge ─────────────────────────────────────────────────────────────

  Scenario: Warning badge for partial CLI (no session tracking)
    Given the user adds amp using the predefined template
    When the row appears in the CLI Integrations pane
    Then a warning icon is visible next to the row name
    And hovering the icon shows "Sends full chat history on every request"

  # ── Session tracking ──────────────────────────────────────────────────────────

  Scenario: Session ID extracted and injected on resume
    Given a CLI with session_id_output_path "$.session_id" is enabled
    And a first prompt returns JSON containing session_id "ses-abc123"
    When a second prompt is sent in the same chat session
    Then the resume_session_flag and "ses-abc123" are appended to the command

  Scenario: Session-less CLI sends full chat history
    Given a CLI with empty session_id_output_path is enabled
    And the chat has two prior turns (one user message, one assistant response)
    When a third user message is sent
    Then the full conversation is formatted as "User: ...\nAssistant: ...\nUser: <new message>"
    And the formatted string is injected via the prompt template

  # ── Edit flow ─────────────────────────────────────────────────────────────────

  Scenario: Edit predefined-based row — duplicate label excluded
    Given an opencode row exists in the CLI Integrations pane
    When the user clicks the pencil icon on that row
    And saves without changing the Label
    Then no duplicate-label validation error fires
    And the row retains its updated values

  Scenario: Built-in CLI edit — only model_name editable
    Given the Claude row is visible in the CLI Integrations pane
    When the user clicks the pencil icon
    Then all fields except model_name are displayed as read-only
    And saving a new model_name updates ProviderPreferences via the existing IPC

  # ── Runtime errors ────────────────────────────────────────────────────────────

  Scenario: response_text_path extraction failure surfaces error card
    Given a CLI with output_format json and response_text_path "$.result" is enabled
    And the CLI returns valid JSON that does not contain a "result" key
    When the user sends a prompt
    Then a typed error card appears in the transcript for that provider
    And no plain-text reply is shown

  Scenario: session_id extraction failure surfaces warning, not error
    Given a CLI with session_id_output_path "$.session_id" is enabled
    And the CLI returns JSON that does not contain a "session_id" key
    When the user sends a prompt
    Then the reply is displayed normally
    And a warning message indicates that session tracking was skipped for this turn

  # ── Test button ───────────────────────────────────────────────────────────────

  Scenario: Test button validates JSON structure
    Given the Add dialog has output_format json and response_text_path "$.result"
    When the user clicks Test
    Then the CLI runs with {prompt} substituted by "hello"
    And success requires the output to be parseable JSON containing a "result" key
    And failure shows "Ensure that CLI tool is installed and authenticated"
