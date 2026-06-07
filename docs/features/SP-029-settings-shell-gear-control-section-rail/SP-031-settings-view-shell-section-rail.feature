Feature: Settings view shell with section rail and empty panes
  As a user I want to navigate through settings sections via a side rail
  so that I can find the settings section I need and see the active pane

  Scenario: Settings view shows section rail with all seven section labels
    Given the panel is in the settings sub-view
    When the settings view renders
    Then the section rail shows the labels API Keys, CLI Integrations, Themes, General, Keyboard Shortcuts, Account, and About

  Scenario: First section is selected by default
    Given the panel is in the settings sub-view
    When the settings view renders
    Then the API Keys section is selected as the active tab
    And the API Keys tabpanel is displayed as the content area

  Scenario: Clicking a rail item selects it and shows its pane
    Given the settings view is open with API Keys selected
    When the user clicks on the "General" section in the rail
    Then the General section becomes the active tab
    And the General tabpanel is displayed
    And the API Keys tabpanel is hidden

  Scenario: Arrow key navigation through rail items
    Given the settings view is open and a rail tab has focus
    When the user presses Arrow Down
    Then the next section in the rail becomes the active tab
    And its tabpanel is displayed

  Scenario: Esc restores the panel from the settings view
    Given the settings view is open
    When the user presses Escape
    Then the settings view closes and the chat panel is restored
