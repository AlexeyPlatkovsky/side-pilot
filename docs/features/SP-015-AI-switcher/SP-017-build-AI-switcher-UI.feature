Feature: AI switcher UI, provider picker, and streaming response display
  As a user I want to choose which AI provider handles my prompt
  so that I can compare responses or focus on a specific assistant

  Scenario: Default state — Codex is active provider
    Given the chat panel is open with no prior interaction
    Then the AI switcher icon shows the OpenAI/Codex logo
    And no picker is visible

  Scenario: Open provider picker
    Given no response is in flight
    When the user clicks the AI switcher icon
    Then a vertical provider picker opens
    And "All" appears at the top of the list
    And the currently active provider has a distinct background

  Scenario: Select a different provider
    Given the provider picker is open
    When the user selects Claude
    Then the picker closes
    And the AI switcher icon updates to the Claude logo
    And the next send will route to Claude

  Scenario: Switcher is disabled while response is in flight
    Given a response is currently streaming
    When the user attempts to click the AI switcher icon
    Then the picker does not open
    And the switcher icon appears disabled

  Scenario: All mode — responses stream in as separate labeled messages
    Given the active provider is All
    When the user sends a prompt
    Then three separate message slots appear in the thread, one per provider
    And each slot shows a loading indicator until its response arrives
    And each arriving response streams into its labeled slot

  Scenario: All mode — partial provider failure shows inline error card
    Given the active provider is All
    And Gemini returns an error
    When the user sends a prompt
    Then Codex and Claude responses appear normally in the thread
    And the Gemini slot displays an inline error card
    And the Send button re-enables after all slots resolve

  Scenario: Single-provider failure shows inline error message
    Given the active provider is Claude
    And Claude returns a timeout error
    When the user sends a prompt
    Then an inline error message appears in the thread under the Claude label
    And the Send button re-enables
