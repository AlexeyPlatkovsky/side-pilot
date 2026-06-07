Feature: Global provider model preferences
  As a side-pilot user
  I want every AI provider to use a persisted global model and reasoning setting
  So that routed answers use predictable provider-specific configuration

  Scenario: Route using fixed provider defaults
    Given the preferences file is missing
    When the user sends a prompt to All
    Then Codex receives model "gpt-5.5" and reasoning "low"
    And Claude receives model "haiku" and reasoning "low"
    And Gemini receives model "gemini-3-flash-preview" and no reasoning flag
    And replies show "gpt-5.5-low", "haiku-low", and "gemini-3-flash-preview-none"

  Scenario: Load valid persisted provider preferences
    Given valid global provider preferences were persisted before app startup
    When the user starts a new prompt
    Then the prompt snapshots the persisted model and reasoning for every targeted provider
    And the reply badges show the snapshotted configuration

  Scenario: Fall back independently for partial valid JSON
    Given the preferences file is valid JSON
    And Codex settings are valid
    And Claude and Gemini settings are missing or invalid
    When the app loads preferences
    Then Codex keeps its valid settings
    And Claude and Gemini use their Rust-defined defaults
    And chat remains usable without a blocking error

  Scenario: Fall back completely for malformed JSON
    Given the preferences file is syntactically malformed JSON
    When the app loads preferences
    Then all providers use their Rust-defined defaults
    And chat remains usable without a blocking error

  Scenario: Pass arbitrary reasoning values safely
    Given Codex or Claude has a trimmed non-empty reasoning value other than "none"
    When a new prompt targets that provider
    Then the reasoning value is passed unchanged as a separate CLI argument
    But empty reasoning or "none" produces no reasoning flag
    And Gemini never receives a reasoning flag
    And empty reasoning displays as "none" in the reply badge

  Scenario: Update preferences atomically
    Given the app has loaded a valid provider configuration snapshot
    When a caller updates the provider preferences through the update API
    Then the validated preferences are persisted atomically
    And the in-memory snapshot is refreshed immediately
    And the next prompt uses the updated configuration

  Scenario: Keep in-flight configuration stable
    Given a prompt has snapshotted provider configuration and is in flight
    When global preferences change
    Then that prompt keeps its original snapshot
    And the next prompt uses the new configuration

  Scenario: Do not retry a rejected configured model
    Given a provider has a configured model that its CLI rejects
    When the prompt runs
    Then the normal persisted provider error is shown
    And the app does not retry with another model
