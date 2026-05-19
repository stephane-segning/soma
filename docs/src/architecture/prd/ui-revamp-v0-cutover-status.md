# UI Revamp v0 — Cutover Status

Closes out the cutover series that landed the locked v0 surfaces from
[`ui-revamp-v0.md`](./ui-revamp-v0.md) and [`ui-revamp-v0-scaffold.md`](./ui-revamp-v0-scaffold.md)
into `desktop/soma`. Captures what's done, what's still open, and the
gap most worth fixing before this work hardens — automated tests.

## What landed

Ten PRs, each a focused chunk. Listed in merge order.

| PR | Cutover | Scope |
|----|---------|-------|
| [#71](https://github.com/stephane-segning/soma/pull/71) | 1 | Tabbed Space settings shell (General · Members · Bots · Assistant · Sharing · Danger). Bots tab UI wired to a stub hook; capability issuance throws until 1b. |
| [#72](https://github.com/stephane-segning/soma/pull/72) | 2 | Replace renderer `SpacesRail` with `@soma/ui` rail. Bundles a P0 hotfix mounting `SomaIntlProvider` at the renderer root — Cutover 1 had shipped `useT()`-using components that would have crashed at first render of the Bots add panel. |
| [#73](https://github.com/stephane-segning/soma/pull/73) | 3 | Add a Jump-to-page `TreePopover` trigger to `AsideNavigation`. Floating-UI anchored under the header, populated from `useSpacesQuery`. The existing DnD `PageTree` stays — the popover is a complementary quick-switch, not a replacement. |
| [#74](https://github.com/stephane-segning/soma/pull/74) | 4 | Swap `CommandPaletteShell` from `react-cmdk` to `@soma/ui`'s `CommandPalette`. Sections Recent · Spaces · Documents · Commands. Adds an `onQueryChange` prop to the @soma/ui component so host apps can pipe debounced queries into an external search service. Drops `react-cmdk` from `desktop/soma`. |
| [#75](https://github.com/stephane-segning/soma/pull/75) | 5a | TipTap bubble menu renders `SelectionBubble` instead of the bespoke `FormatToolbar`. Wires bold/italic/underline/strike/code/link/highlight + block-style dropdown (replacing the rotate button). Ask AI chip routes to the existing quick-action panel handler — replaced again in 5d. |
| [#76](https://github.com/stephane-segning/soma/pull/76) | 5b | TipTap slash menu renders `SlashMenu`. Adds `captureScope: "container" \| "window"` to the @soma/ui component so editor surfaces can listen for keyboard events while focus stays in the contenteditable. Renames the renderer command interface to require `section: SlashMenuSection` + optional `icon` + `shortcut`. Reserves a fixed icon slot so undefined-icon rows stay aligned. |
| [#77](https://github.com/stephane-segning/soma/pull/77) | 5c | TipTap mention picker renders `MentionPicker`. Extends `MentionSectionKind` with `"spaces"` so soma's `%` provider can render. Same `captureScope` pattern as SlashMenu. `MentionProvider` gains a required `section` field. |
| [#78](https://github.com/stephane-segning/soma/pull/78) | 5d | Mount `NodeAIRegistryExtension` in the default extension stack. New `createDefaultAIRegistry({ editor, onQuickAction })` factory bridges the legacy `onQuickAction` callback into the locked registry contract — explain/expand/research register across every text-bearing block type. `ContextualMenu` renders `SelectionAIBar` (replacing `QuickActionPanel`) when Ask AI fires. |
| [#79](https://github.com/stephane-segning/soma/pull/79) | 5e | ActionMenu chrome refresh. Drag-handle menu uses `glass-panel shadow-elevated`. New `HandleButton` helper standardises the buttons; `onClick` keyboard-accessible everywhere. Drag-handle `<div>` gets an `aria-label`. Rotate tooltip routes through `useT` with localized block names. |
| [#80](https://github.com/stephane-segning/soma/pull/80) | 1b | End-to-end wiring of `issueIssuerCapability` from the Bots tab's Add form through IPC + RTK Query to the daemon. Fixes a unit mismatch caught in review — Rust treats `expires_at` as epoch seconds, JS callers stay in ms; conversion lives at the daemon-client boundary. `expires_at == 0` is the daemon's no-expiry sentinel; the form's "Never" toggle now flows through correctly. |

Each cutover landed with a typecheck pass on both `pnpm --filter soma run typecheck:web` and (for backend-touching changes) `typecheck:node`. The pre-existing `pnpm --filter @soma/editor run typecheck` failure (`error TS2209: project root is ambiguous`) sits on `main` from before this work — verification of the editor package was via the soma renderer's transitive typecheck.

## Open gaps

### Daemon-side (Rust)

These three unblock the next round of UI work.

- ~~**`SomaHandle.list_space_bots`** — no napi method yet. The Bots tab's list view is empty until this lands. `useSpaceBots` is shaped to drop in a `useListSpaceBotsQuery` call without further component changes.~~ **Landed in [#84](https://github.com/stephane-segning/soma/pull/84)** — `DaemonHandle::list_space_bots` filters memberships server-side to `role == "bot"`, exposed through napi as `listSpaceBots`, IPC channel `spaces_list_bots`, RTK Query `useListSpaceBotsQuery`. The hook now hydrates `bots` from the daemon. Bot rows are mapped onto the `@soma/ui` `Bot` shape with a placeholder `alias = "bot-<peerSuffix>"` and `status = "active"` until the schema extensions below land.
- ~~**Capability record schema** — the `IssueIssuerCapability` daemon path stores peer id + expiry only. The Bots form captures `alias` + `scopeIds[]` and currently throws them away.~~ **Alias half landed in [#85](https://github.com/stephane-segning/soma/pull/85)** — new migration adds `issuer_capabilities.alias`, plumbed end-to-end through `IssueIssuerCapabilityInput` → napi → IPC → RTK Query → `useSpaceBots.addBot`. The list view shows the operator-typed alias instead of the synthesised `bot-<peerSuffix>` placeholder (which now only fires for legacy rows / blank inputs). **`scopeIds[]` half landed** — new migration adds `issuer_capabilities.scopes` (nullable TEXT, JSON-encoded array), plumbed end-to-end through storage → membership → daemon → napi → IPC → RTK Query → `useSpaceBots.addBot` (forwards `input.scopeIds` as `scopes`). Scopes are stored + plumbed for forward-looking visibility only — runtime authorisation enforcement (`validate_issuer_capability`) is NOT yet implemented and is a separate, larger PR.
- **Bot status event stream** — once bots are listed, the UI wants to reflect handshake state (`pending` / `active` / `expired`) without polling. A daemon event stream (analogous to the existing `agent-events`) would let the renderer subscribe.
    - **Foundation landed in [#86](https://github.com/stephane-segning/soma/pull/86)**: migration adds `issuer_capabilities.status TEXT NOT NULL DEFAULT 'active'`; daemon derives `expired` from `expires_at` at read time; new `BotStatus` `"expired"` variant on `@soma/ui` with a `warning`-tone Pill.
    - **Event stream landed in [#87](https://github.com/stephane-segning/soma/pull/87)**: new `BotStatusChangedEvent` proto variant on `DaemonEvent`; daemon publishes on every issuance; napi + soma main translate to a `space-changed` domain event keyed by `(spaceId)`, which invalidates the `SpaceMembers/<spaceId>` RTK cache tag so the Bots-tab list refetches without polling.
    - **Handshake protocol landed in [#88](https://github.com/stephane-segning/soma/pull/88)**: new `/soma/issuer-offer/1` libp2p request_response protocol. Owner issuance now writes `pending` to storage and dispatches the signed capability to the delegate peer; the delegate auto-ACKs via the codec layer; on receipt the owner transitions to `active` (or `failed` on libp2p send error / timeout) and publishes a follow-up `BotStatusChangedEvent`. The `Bots` tab pill now reflects the real handshake outcome end-to-end. Capability-validation on the delegate side is deferred to a separate PR (the codec accepts any well-formed proto and auto-ACKs).

### Renderer follow-ups (TypeScript only)

These can land independently of daemon work.

- **`@mention` bots provider** — once `list_space_bots` ships, register a fourth `MentionProvider` with `section: "bots"` so `@bot:alias` resolves inline in the editor and chat composers.
- **Block-level AI dispatch** — Cutover 5e didn't wire the action-menu's AI affordance. The plan is: click AI on the drag handle → set the block as a `NodeSelection` → `ContextualMenu` renders `SelectionAIBar` with `surface: "node"`. The registry and the UI both already understand the node surface; only the trigger is missing.
- **Editor-command icons** — `desktop/soma/.../space-page/editor-commands.ts` registers four slash commands (`new-sub-page`, `insert-image`, `insert-file`, `link-to-page`) without icons. SlashMenu now reserves the slot so alignment is fine, but the rows look bare next to the default commands. Rename to `.tsx` and pass `react-feather` icons.
- **Recent-pages slice** — `TreePopover` and `CommandPalette` both surface a Recent section that's empty in v0. Add a small redux slice keyed by `(spaceId, pageId, openedAt)`, capped at ~10 entries, hydrated from disk.
- **Default-expiry policy** — `useSpaceBots.addBot` currently passes `0` (no expiry) for the form's "Never" toggle. The daemon ought to enforce a maximum issuable lifetime, after which the wrapper would translate `null` into that ceiling instead of unbounded.

### Locked @soma/ui surfaces that ship inert in soma today

- `SelectionBubble`'s **Comment** + **More** buttons — not wired (the menu component's props are optional; the buttons hide when their callbacks aren't passed).
- `SelectionBubble`'s **Highlight** — needs `@tiptap/extension-highlight` added to the editor stack. The button is conditionally rendered via the `onToggleHighlight` callback, so dropping it in is one extension + one wire.
- `BackendSwitcher` — exists in `@soma/ui`; the chat composer hasn't been touched to include it. Trivial drop-in when the ACP backend list is ready.

### Tooling

- **`@soma/editor` typecheck broken on `main`** — `tsc --noEmit -p tsconfig.json` fails with `error TS2209: The project root is ambiguous`. Predates this revamp; surfaced because cutovers 5a–5e all touched the package. Workaround: typecheck via the soma renderer, which transitively type-checks the editor.
- **`@soma/editor` storybook** — broken per earlier session notes (path-resolution error). Wave-4-and-after work was verified via @soma/ui's storybook + soma's typecheck instead. Storybook stories for the editor exist (`document-editor.stories.tsx`, `node-ai-registry.stories.tsx`) and would be the cheapest way to add interactive smoke coverage once the build is healthy.

## The testing gap

**None of the ten cutover PRs ship new automated tests.** That's the single biggest risk in this body of work, and it's deliberate to call out rather than bury.

What we relied on:

1. **`tsc --noEmit`** — caught every signature mismatch and every breaking-change ripple through the workspace (e.g. the `EditorCommand.section` field migration in 5b).
2. **Storybook for `@soma/ui`** — visual sanity for the locked components in isolation, on their own catalog. Doesn't exercise the renderer wiring.
3. **Code review (Gemini code-review bot)** — caught several real bugs, including the unit-mismatch P0 in 1b and the listener-churn perf issue in 5c. Helpful, but not a substitute for tests.

What we don't have:

- **No unit tests** for the new hooks (`use-space-bots`, `useSpaceAccessSettings`, `useWorkspaceAgentSettings`), the AI registry factory (`createDefaultAIRegistry`), the renderer-side `SpacesController.issueIssuerCapability`, or the IPC handler in `space-handlers.ts`. Regressions here are silent until a user trips them.
- **No integration tests** for the IPC boundary. The unit-mismatch bug in 1b would have been caught by a single test that issued a capability and read back the stored `expires_at` — none exists.
- **No E2E / smoke tests** of the renderer. Each cutover PR's "test plan" was a manual checklist that nobody ran.
- **No regression coverage** for the @soma/ui surfaces themselves. The `captureScope` prop, the icon-slot reservation, the ref-pattern fix to MentionPicker, the `onQueryChange` prop on CommandPalette — all locked-in via type signatures, none via assertions.

### What's most worth adding first

Triaged by risk × cost:

1. **IPC boundary contract tests** for `spaces_issue_issuer_capability`, `spaces_list_members`, `spaces_decide_join` — main process plus a thin renderer-service test that mocks `invoke`. The unit-mismatch bug template is here.
2. **Hook tests** for `use-space-bots` using `@testing-library/react` — covers form-to-mutation translation including the no-expiry path, future-date validation, and the spaceId-missing case.
3. **Registry-action tests** for `createDefaultAIRegistry` — register, resolve by node type, dispatch explain/expand and assert insertion at the right range. Mocks the editor handle.
4. **Smoke storybook stories** for each renderer wrapper (`SpacesRail`, `JumpToPageButton`, `CommandPaletteShell`, `BotsTab`) once the storybook config is healthy.

A reasonable target before the next round of feature work: ~20–30 tests covering the four areas above. Most are small. The work is more about choosing the testing harness (vitest plus testing-library is already in the soma `devDependencies`) and writing the first one than about volume.

> **Update (post-#82):** the test infrastructure landed in [#82](https://github.com/stephane-segning/soma/pull/82) — vitest + `@vitest/coverage-v8` on `@soma/ui` and the soma renderer, `@storybook/react` portable-stories wired through `setProjectAnnotations`, and a Cucumber × Playwright (`playwright-bdd`) E2E package targeting the same Storybook artifact we publish to gh-pages. Seed tests cover items 1–2 from the triage above (IPC contract for `issueIssuerCapability`, hook tests for `useSpaceBots`). Items 3–4 (NodeAIRegistry actions, renderer-wrapper smoke stories) remain open follow-ups now that the harness is in place. See [Testing](../../development/testing.md) for the running surfaces.

## Pointers

- Locked PRD: [`ui-revamp-v0.md`](./ui-revamp-v0.md)
- ADR with the locked decisions: [`../adrs/0005-ui-revamp-v0.md`](../adrs/0005-ui-revamp-v0.md)
- Build waves + acceptance criteria: [`ui-revamp-v0-scaffold.md`](./ui-revamp-v0-scaffold.md)
- Per-flow refs: `ui-revamp-v0-refs-*.md` siblings
- `@soma/ui` package: `desktop/desktop-ui/src/components/`
- `@soma/editor` package: `desktop/desktop-editor/src/`
- Soma renderer: `desktop/soma/src/renderer/src/`
- Main process IPC handlers: `desktop/soma/src/main/command-registry/`
