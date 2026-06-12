Feature: Rust — full-chat history formatting and model_name ProviderPreferences wiring
  As a developer I want session-less CLIs to receive full conversation context
  and built-in CLI model_name edits to persist through ProviderPreferences

  # ── Full-chat history formatting ──────────────────────────────────────────────

  Background:
    Given a CustomCliEntry with empty session_id_output_path (no session tracking)

  Scenario: First message in new chat is formatted with User label
    Given the chat has no prior turns
    When the user sends "What is Rust?"
    Then the injected prompt string is:
      "User: What is Rust?"

  Scenario: Multi-turn chat is formatted as full history
    Given the chat has two prior turns:
      | role      | content                |
      | user      | What is Rust?          |
      | assistant | Rust is a systems lang |
    When the user sends "Tell me more"
    Then the injected prompt string is:
      "User: What is Rust?\nAssistant: Rust is a systems lang\nUser: Tell me more"

  Scenario: Full history injected via prompt template substitution
    Given prompt_template is "--prompt {prompt}"
    And the formatted history is "User: hello\nAssistant: hi\nUser: bye"
    When the adapter constructs the command
    Then the {prompt} placeholder is replaced by the full history string (shell-escaped)

  Scenario: Session-less fallback does not break existing plain-output CLIs
    Given an existing plain-output custom CLI entry from SP-072 with empty session_id_output_path
    When the user sends a message
    Then the behavior is identical to a session-less CLI with history formatting
    And the SP-072 feature scenarios still pass

  # ── model_name ProviderPreferences wiring for built-ins ──────────────────────

  Scenario: Built-in Claude model_name edit persists through ProviderPreferences
    Given the user opens the Claude edit dialog and sets model_name to "claude-opus-4-8"
    When the user clicks Save
    Then update_provider_preferences IPC is called with the new model_name for Claude
    And get_provider_preferences returns "claude-opus-4-8" for Claude on next read

  Scenario: Built-in Codex model_name edit persists through ProviderPreferences
    Given the user opens the Codex edit dialog and sets model_name to "codex-mini"
    When the user clicks Save
    Then update_provider_preferences IPC is called with the new model_name for Codex

  Scenario: Built-in Gemini model_name edit persists through ProviderPreferences
    Given the user opens the Gemini edit dialog and sets model_name to "gemini-2.5-pro"
    When the user clicks Save
    Then update_provider_preferences IPC is called with the new model_name for Gemini

  Scenario: Built-in CLI model_name is read from ProviderPreferences on pane open
    Given update_provider_preferences previously stored "claude-opus-4-8" for Claude
    When the user opens the CLI Integrations pane
    Then the Claude row shows "claude-opus-4-8" as the current model_name

  Scenario: model_name for built-ins is not stored in CliIntegrations struct
    Given a built-in CLI entry is loaded from preferences.json
    Then the CliIntegrations struct for that entry does not carry a model_name field
    And model_name is sourced exclusively from ProviderPreferences
