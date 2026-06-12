Feature: Rust — JSONPath extraction layer for response and session ID
  As a developer I want a shared utility to extract values from CLI JSON/JSONL output
  so that response_text_path and session_id_output_path are reliably resolved

  Background:
    Given the JSONPath library (jsonpath-rust or serde_json_path) is added as a dependency

  # ── response_text_path — json format ─────────────────────────────────────────

  Scenario: Extract reply from single JSON object
    Given output_format is "json"
    And the CLI returns: {"result": "Hello!", "session_id": "ses-1"}
    And response_text_path is "$.result"
    When extraction runs
    Then the reply is "Hello!"

  Scenario: response_text_path targets nested key
    Given output_format is "json"
    And the CLI returns: {"item": {"completed": {"item": {"text": "Done"}}}}
    And response_text_path is "$.item.completed.item.text"
    When extraction runs
    Then the reply is "Done"

  Scenario: response_text_path targets array element
    Given output_format is "json"
    And the CLI returns: {"messages": ["first", "second"]}
    And response_text_path is "$.messages[0]"
    When extraction runs
    Then the reply is "first"

  # ── response_text_path — jsonl format ────────────────────────────────────────

  Scenario: Apply path to every JSONL line, concatenate successful extractions
    Given output_format is "jsonl"
    And the CLI emits three lines:
      | {"type":"delta","message":{"content":{"text":"Hello"}}} |
      | {"type":"other","data":{}}                               |
      | {"type":"delta","message":{"content":{"text":" world"}}} |
    And response_text_path is "$.message.content.text"
    When all lines are collected after process exit and extraction runs
    Then the reply is "Hello world"

  Scenario: JSONL lines that fail extraction are silently skipped
    Given output_format is "jsonl"
    And one JSONL line is not valid JSON
    When extraction runs
    Then the invalid line is skipped
    And no panic or Rust error occurs

  # ── session_id extraction ─────────────────────────────────────────────────────

  Scenario: Extract session ID from JSON response
    Given session_id_output_path is "$.session_id"
    And the response contains: {"result": "Hi", "session_id": "ses-abc123"}
    When session ID extraction runs
    Then the extracted ID is "ses-abc123"
    And it is stored for the next turn in this chat session

  Scenario: session_id path missing from response — warning not error
    Given session_id_output_path is "$.session_id"
    And the response JSON does not contain a "session_id" key
    When session ID extraction runs
    Then no error is raised
    And a warning event is emitted for the UI
    And the reply is still delivered normally

  # ── response_text_path extraction failure ────────────────────────────────────

  Scenario: response_text_path missing from response — typed error surfaced
    Given response_text_path is "$.result"
    And the CLI returns valid JSON that does not contain a "result" key
    When extraction runs
    Then a typed CliExtractionError is returned
    And it is surfaced as an error card in the chat transcript

  Scenario: CLI returns non-JSON when output_format is json — typed error surfaced
    Given output_format is "json"
    And the CLI returns plain text "some output"
    When extraction runs
    Then a typed CliExtractionError is returned

  # ── session_id_output_path empty ─────────────────────────────────────────────

  Scenario: Empty session_id_output_path means no session tracking
    Given session_id_output_path is ""
    When the CLI returns a response
    Then no session ID extraction is attempted
    And the adapter does not store any session ID

  # ── $ syntax and standard JSONPath ───────────────────────────────────────────

  Scenario: Full $ prefix syntax is supported
    Given a JSONPath expression "$.data.items[1].value"
    When the expression is applied to matching JSON
    Then the correct nested value is extracted without error
