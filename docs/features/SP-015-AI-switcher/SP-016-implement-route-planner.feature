Feature: Route planner, diff computation, and provider-sends junction table
  As the Rust core I want to track which messages have been sent to each provider
  so that each provider only receives the context it has not already seen

  Scenario: First send to a provider with empty history
    Given a chat with no prior messages
    When the user sends a prompt to Codex
    Then the route planner returns Codex as the sole adapter target
    And the diff includes the user prompt with no prior context
    And a message_provider_sends row is written for (prompt_id, codex)

  Scenario: Switch provider — only unsent messages included in diff
    Given a chat with three messages already sent to Codex
    When the user switches to Claude and sends a new prompt
    Then the route planner returns Claude as the sole adapter target
    And the diff includes all four messages (three prior + new prompt)
    And prior Codex responses are formatted as role:assistant content:"[Codex]: <original>"
    And message_provider_sends rows are written for all four messages with provider=claude

  Scenario: Subsequent message to same provider — only new messages included
    Given a chat where messages 1-4 are already marked sent to Claude
    When the user sends message 5 to Claude
    Then the diff includes only message 5
    And no duplicate message_provider_sends rows are created

  Scenario: All route dispatches concurrently to all active providers
    Given three active providers: Codex, Claude, Gemini
    When the user sends a prompt with route=All
    Then the route planner prepares three concurrent adapter requests
    And each request receives the correct unsent diff for its provider

  Scenario: Partial failure in All mode does not cancel other requests
    Given three active providers: Codex, Claude, Gemini
    And Gemini returns an error
    When the user sends a prompt with route=All
    Then Codex and Claude responses are returned successfully
    And the Gemini slot carries an error result
    And message_provider_sends rows are written only for successful sends

  Scenario: Per-provider timeout matches SP-009 contract
    Given the SP-009 adapter timeout is configured at T seconds
    When a provider request exceeds T seconds
    Then the route planner cancels that request and returns a timeout error for that slot
    And other in-flight slots are not affected
