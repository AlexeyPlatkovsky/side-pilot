Feature: Themes section with selectable visual themes
  As a user I want to select from multiple visual themes in the Settings panel
  So that the app appearance matches my preference and is restored on every launch

  Scenario: User selects a non-default theme and it applies live
    Given the user has opened the Settings panel and navigated to the Themes section
    When the user selects the "Cyberpunk" theme
    Then the app visual appearance updates immediately to the Cyberpunk style
    And the Themes section shows "Cyberpunk" as the selected theme

  Scenario: Theme selection persists across restart
    Given the user has selected the "Minimalist" theme in the Themes section
    When the app is closed and restarted
    Then the app starts with the "Minimalist" theme applied
    And the Themes section shows "Minimalist" as the active selection

  Scenario: Default theme applied on first launch with no saved preference
    Given no theme preference has been previously saved
    When the app starts
    Then the Default theme is applied
    And the Default theme appearance is visually identical to the pre-theme-system look

  Scenario: User reverts to Default theme
    Given the user had previously selected the "Cyberpunk" theme
    When the user selects "Default" in the Themes section
    Then the app appearance reverts to the Default style immediately
    And the Default preference is persisted so it survives a restart

  Scenario: Preference store write failure during theme selection
    Given the preferences store is unavailable when the selection is saved
    When the user selects the "Cyberpunk" theme
    Then the theme is applied visually for the current session
    And a visible error or warning is shown indicating the preference could not be saved
