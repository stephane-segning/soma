## UI Components and Storybook

### Chat + Reasoning
- `AiConversation` + `AiMessage` render chat roles (user/assistant/tool/source) with optional thinking blocks.
- `AiThinking` renders a collapsible “Thinking…” section; pass `status="thinking" | "complete"`, `durationLabel`, and `content` (markdown rendered via `AiMarkdown`).
- Keep chat wrappers thin: `AiChat` provides a scroll container; inputs are kept separate.

### Grapheme-Aware Typing (Tapia)
- `useGraphemes(value: string)` splits text into grapheme clusters using `Intl.Segmenter` (fallback to `Array.from`).
- `CharDisplay` is a dumb renderer that expects `shouldGraphemes` and `isGraphemes`. It aligns glyphs (including emojis) and shows mismatches with an elevated correct glyph.

### Desktop Layout
- `DesktopShell` is a full-screen wrapper with optional left/right sidebars, header/footer slots, and overlay layer.
- Sidebars are resizable via `re-resizable`; pass `initialLeftWidth`/`initialRightWidth` and `onLeftResizeStop`/`onRightResizeStop` to persist widths (see `PersistentWidths` story).
- The main column enforces `overflow-auto` with `max-h-full`, so long content scrolls while sidebars stay fixed.
- Header is a render-prop: receives `toggleLeft`, `toggleRight`, and open state so apps can control toggles (e.g., menu/info buttons).

### Window drag regions (Tauri vs Electron)
- Tauri: use `data-tauri-drag-region` (Tauri recognizes this attribute for draggable regions).
- Electron (`desktop/soma`): use `data-drag-region` + CSS `-webkit-app-region: drag` (see `desktop/soma/src/renderer/src/styles/app.scss`). Mark interactive elements with `data-no-drag`.

### Storybook
- Components live in the `@soma/ui` package (`desktop/desktp-ui`). Stories are under `src/stories`.
- Build locally: `pnpm --filter @soma/ui run storybook` (dev) or `pnpm --filter @soma/ui run build:storybook`.
- Docs pipeline: `just build-docs` now also builds Storybook into `site/storybook` after MkDocs runs.
