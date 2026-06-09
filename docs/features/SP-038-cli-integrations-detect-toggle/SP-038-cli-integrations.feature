Feature: CLI integrations settings — detect, status, and enable/disable local AI CLIs
  As a user I want to see which local CLIs are installed and authenticated
  so that I can control which ones side-pilot routes to

  Scenario: All CLIs detected and enabled on startup
    Given the user launches the app
    And codex, claude, and gemini are all installed and (for codex/claude) authenticated
    When startup detection completes
    Then the CLI Integrations pane shows all three as "Available"
    And all three toggles are enabled (checked)
    And the AI switcher shows GPT, Claude, Gemini, and All

  Scenario: One CLI not installed
    Given codex is on PATH but claude is not
    When the user opens CLI Integrations settings
    Then Codex shows "Available" with toggle enabled
    And Claude shows "Not installed" with toggle disabled
    And the AI switcher hides Claude and All dispatches only to Codex

  Scenario: CLI installed but not authenticated
    Given claude binary is on PATH but `claude auth status` reports loggedIn: false
    When detection completes
    Then Claude shows "Not authenticated" with toggle disabled

  Scenario: Detection command fails
    Given codex binary is on PATH but `codex login status` exits with non-zero or times out
    When detection completes
    Then Codex shows "Not detected" with toggle disabled

  Scenario: Re-check a previously not-installed CLI
    Given Claude is "Not installed"
    And the user installs Claude globally
    When the user clicks "Re-check" on the Claude row
    Then a global spinner appears
    And the status updates to "Available" (or "Not authenticated")
    And the toggle becomes enabled

  Scenario: Disable a CLI mid-chat
    Given Codex is enabled and the user has a chat with Codex messages
    When the user disables Codex in CLI Integrations
    Then GPT disappears from the AI switcher
    And existing Codex messages remain visible
    And "All" no longer includes Codex
    And re-enabling Codex restores it to the switcher

  Scenario: All providers disabled
    Given all three CLIs are disabled
    When the user opens any chat
    Then the composer area shows "No AI providers, check settings → CLI Integrations"
    And the Send button is disabled
    And the AI switcher is hidden

  Scenario: In-flight response from disabled provider
    Given Claude is enabled and the user has a pending Claude response
    When the user disables Claude in settings while the response is in flight
    Then the response still renders in the transcript when it arrives
    But Claude is no longer available in the AI switcher for subsequent messages
