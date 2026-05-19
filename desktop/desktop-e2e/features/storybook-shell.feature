Feature: Storybook catalog renders the locked @soma/ui surfaces
  As a contributor reviewing the cutover work
  I want a smoke pass against the public Storybook
  So that regressions to the locked v0 components surface in CI

  Background:
    Given the Storybook catalog is open

  Scenario: The sidebar lists the locked Primitives section
    When I look at the catalog sidebar
    Then I see a "Primitives" group

  Scenario: The Pill story renders all five locked tones
    When I open the "Primitives/Pill" story "Tones"
    Then the preview frame contains "Neutral"
    And the preview frame contains "Info"
    And the preview frame contains "Success"
    And the preview frame contains "Warning"
    And the preview frame contains "Error"

  Scenario: The Empty story renders its locked copy
    When I open the "Primitives/Empty" story "Full"
    Then the preview frame is not blank
