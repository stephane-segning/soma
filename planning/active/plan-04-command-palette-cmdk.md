# Plan 04: Command Palette (cmdk) Decision + Direction

Context
- `react-cmdk` is currently integrated, but it’s unclear whether we want/need it long-term.
- If we keep a command palette, we should be confident in: UX, accessibility, performance, and maintainability.

Goal
- Decide whether to keep `react-cmdk` (or similar) vs building a small in-house command palette.
- If we keep it: make it “feel Soma” (styling, actions, navigation integration).
- If we remove it: replace with a lightweight custom palette with the exact features we need.

Decision criteria (keep vs build)
- UX: fuzzy search quality, grouping, recent commands, keyboard-first flows.
- A11y: focus management, ARIA roles, screen reader behavior.
- Integration: deep-link navigation + actions (spaces/pages, settings, “open chat”, etc).
- Theming: Tailwind/daisyui compatibility, consistent layout tokens.
- Maintenance: dependency churn risk vs internal complexity.

Plan
1) Inventory current usage
   - List all commands/actions exposed today and which are critical vs “nice-to-have”.
2) Define the minimum palette feature set
   - Navigation commands (spaces/pages), action commands (create page, toggle chat), and a few “developer” commands behind a flag.
3) Make a call
   - Keep cmdk if it cleanly meets UX+a11y+theming requirements with minimal glue.
   - Otherwise: build a simple in-house palette (headless listbox + fuzzy filter + keyboard shortcuts).
4) Follow-through
   - If keeping: harden integration, add tests for keyboard behavior, and make the palette visually consistent.
   - If building: remove the dependency and replace with a small component + action registry (single source of truth for commands).
