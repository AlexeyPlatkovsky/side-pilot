Feature: Rust — structured command construction in CustomCliAdapter
  As a developer I want CustomCliAdapter to build the CLI command from the new struct fields
  so that prompts, session IDs, and model flags are injected correctly on each invocation

  Background:
    Given a CustomCliEntry with cli_command "opencode",
          prompt_template "--prompt {prompt}",
          resume_session_flag "--resume",
          session_id_output_path "$.session_id",
          output_format "jsonl",
          response_text_path "$.message.content.text",
          model_flag "--model",
          and model_name "opencode-go/deepseek-v4-pro"

  # ── Happy path — first message ────────────────────────────────────────────────

  Scenario: First message in new chat constructs plain command
    Given no session ID is stored for this chat
    When the user sends "hello world"
    Then the spawned command is:
      opencode --prompt "hello world" --model "opencode-go/deepseek-v4-pro"
    And no resume flag appears in the command

  Scenario: Prompt value is shell-escaped before injection
    Given no session ID is stored for this chat
    When the user sends a prompt containing double-quotes and shell metacharacters
    Then the injected value is wrapped in quotes with internals escaped
    And no shell injection occurs

  # ── Session resume ────────────────────────────────────────────────────────────

  Scenario: Second message injects stored session ID
    Given a session ID "ses-abc123" was extracted from the previous response
    When the user sends "follow-up question"
    Then the spawned command is:
      opencode --prompt "follow-up question" --resume ses-abc123 --model "opencode-go/deepseek-v4-pro"

  Scenario: Missing session ID on second message falls back to first-message form
    Given session_id_output_path is set but no session ID was extracted yet
    When the user sends a second message
    Then the spawned command omits the resume flag
    And no error is raised

  # ── Model flag omitted when empty ─────────────────────────────────────────────

  Scenario: No model_flag means model is not passed
    Given the CustomCliEntry has model_flag "" and model_name ""
    When the user sends a prompt
    Then the spawned command does not contain any model flag

  Scenario: model_flag set but model_name empty means model is not passed
    Given the CustomCliEntry has model_flag "--model" and model_name ""
    When the user sends a prompt
    Then the spawned command does not contain "--model"

  # ── output_format: plain backward compat ─────────────────────────────────────

  Scenario: Plain output format sends prompt via stdin (backward compat)
    Given output_format is "plain" and prompt_template is empty
    When the user sends a prompt
    Then the prompt text is delivered via stdin to the process
    And the process stdout is used as the reply verbatim

  Scenario: Plain output format with explicit prompt template uses flag injection
    Given output_format is "plain" and prompt_template is "--prompt {prompt}"
    When the user sends a prompt
    Then the prompt text is injected via the flag
    And stdin is empty

  # ── macOS login shell ─────────────────────────────────────────────────────────

  Scenario: Command is spawned in login shell on macOS
    Given the platform is macOS
    When the adapter spawns the CLI
    Then the process is invoked as "/bin/zsh -lc '<full command string>'"

  # ── Windows PowerShell ────────────────────────────────────────────────────────

  Scenario: Command is spawned in PowerShell on Windows
    Given the platform is Windows
    When the adapter spawns the CLI
    Then the process is invoked as "powershell -Command '<full command string>'"
