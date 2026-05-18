# UI Revamp v0 — Popup-Window Inspiration

Companion to [ui-revamp-v0.md](./ui-revamp-v0.md) §4.7 (typing popup, but also the v0 instance of the broader multi-window focus-task mechanism that will later host exams and surveys). Sits alongside [ui-revamp-v0-refs.md](./ui-revamp-v0-refs.md); that doc covered the main-window 3-pane layout, panel stack, mention picker, and bot-add — none of which are repeated here.

**Refero coverage caveat.** Almost every reference here is a *modal inside a parent page*, not a separate OS window. Refero indexes web screenshots, and a small companion OS-level `BrowserWindow` is by definition not a web screen. The five candidates below were the highest-signal hits across queries for "picture in picture", "popout chat", "focus mode", "exam mode", "minimal player", and "always on top". Where Refero is thin, we lean on mature cross-product convention (browser PiP, MacOS Stickies, Zoom mini call window) and call that out explicitly. The Refero pass is most useful for §2 (focus-task chrome) and §3 (re-entry); for §1 (mini focus windows) and §4 (always-on-top) we mostly noted patterns to avoid borrowing the wrong thing from full-page modals.

## 1. Mini focus windows (PRD §4.7)

### Borrow

- **Browser native PiP and Zoom mini-call.** Both converge on the same shape: ~320–400px wide, ~200–280px tall, rounded corners, **chrome auto-hides** and reappears on hover. The popup is a *tool*, not a *page* — it has no menu bar, no sidebar, no breadcrumbs. Soma's typing popup should default to ~520×360 (wider because the `CharDisplay` line is the load-bearing content), with chrome that fades to a 24px top drag region when the input has focus.
- **HBO Max player** ([screen 83223629](https://refero.design/pages/83223629-5c5a-46d1-baf7-9aad152120c1)). Not a popup, but the *visual treatment* is the closest Refero match for "a small surface dominated by one content area." Full-bleed content, a single back chevron at top-left, and controls living in a thin band over the content. No surrounding shell. Borrow: the content owns the window; chrome is a single thin overlay strip, not a sticky header.
- **MacOS Stickies / system dictionary lookup.** Both are titled by *content* rather than by app — a sticky shows the note's first line; the dictionary popup shows the word. Soma's popup title should be the exercise's name, not "Soma — Typing", so the user can identify the popup from the dock / window switcher when several are open.

### Avoid

- Treating the popup as "a small version of the main window." No spaces rail, no document column, no right-area panel stack. The popup is one route (`#/popup/typing/<id>`) rendering exactly one component plus its scaffold — that's the whole architecture.
- Native player chrome that exposes too many controls (HBO Max's bottom bar has 8+ buttons). For typing we have at most: close, pin (always-on-top), restart exercise. Anything else belongs in the main window's exercise detail.
- Fixed aspect ratio. Typing exercises need horizontal text room; a square PiP shape would force line breaks mid-word. Constrain min-width (≥ 480px), not aspect.

## 2. Focus-task chrome (PRD §4.7, future exams/surveys)

### Borrow

- **Preply vocab quiz** ([screen f47cc68d](https://refero.design/pages/f47cc68d-8136-4fd9-a0eb-09b810e5210c)). The clearest reference in the entire pass for what our popup chrome should look like — and it isn't even a popup, it's their full-page "focus mode." Three elements total on the top edge: brand mark top-left (we'll use the exercise name instead), a thin centered progress bar, and a single `×` top-right. Body is empty whitespace with the question and two answer buttons centered. No menu, no sidebar, no footer. This is the *floor* for chrome density.
- **Promova quiz** ([screen 8ba45dcc](https://refero.design/pages/8ba45dcc-7372-4cc7-9605-143d67a02330)). Compact pill-shaped header containing only back-arrow, title + timer, and `×`. The pill itself is the entire chrome. Borrow: when the popup needs more state than Preply (timer, attempt count, WPM), collapse it into a single pill on the drag region instead of stacking rows of UI.
- **Raycast command palette** ([screen d907406e](https://refero.design/pages/d907406e-b209-461b-a53a-bf87e3c406b6)). For the *aesthetic* of a small, dense, fully-keyboard-driven surface: thin 1px borders, no shadows, deep neutral background, results list tight-packed. Same density target for our popup body.

### Synthesis: our §4.7 popup chrome

- **Drag region** (top 28px): empty by default; on hover shows three glyphs flush-right — pin (always-on-top toggle), restart, close. No title text in the drag region — the OS window title bar (set to the exercise name) does that.
- **Progress strip** (1px tall, below drag): characters remaining / total. Borrowed directly from Preply's thin progress bar — no labels, no percentage.
- **Body**: `CharDisplay` + input + a single stats row (WPM · accuracy · time). Body uses our density defaults (14px base, no shadows, `base-200` separators).
- **Footer**: omit. Don't borrow Promova's "Continue" button — typing has no continue, it has end-of-line.
- **Keyboard hints**: Esc to close, Cmd-Shift-P to toggle pin, Cmd-R to restart. Don't render hint chrome — discoverability lives in a `?` tooltip on the close glyph, not as persistent footer text.

### Avoid

- Promova's gradient pill backgrounds. They read as "playful quiz", not "focus task." Use a flat surface.
- Preply's *amount* of whitespace. The Preply page is desktop-sized; our window is 520×360. We'll keep their density philosophy (sparse chrome, generous body) but with our tighter spacing scale (`2`–`3`, 8–12px).
- Any persistent help/onboarding chrome. The popup is invoked from a main-window action — the user already knows what it is. No tutorial overlay, no "first run" tip.

## 3. Re-entry into the main window (PRD §4.7 close/end)

### Borrow

- **Zoom call-ended pattern.** When a Zoom mini-window's call ends, the window closes and the main Zoom app comes to focus showing a post-call summary. Soma should do the same: closing the popup (manually or on exercise completion) sends `app.focus()` to the main window and routes it to the originating exercise detail page (`/practice/<exercise-id>`) with a stats summary band injected above the content. If the main window was hidden, show it; if it was minimized, restore it.
- **Browser PiP "return to tab" affordance.** Chrome's PiP has a "back to tab" glyph that closes PiP *and* focuses the source tab. Our pin/restart/close cluster should include a fourth glyph — **return to main window** — that does both: closes the popup and brings the main window forward without ending the exercise. Useful when the user wants to consult their notes mid-drill.
- **Toast on completion.** When the popup auto-closes on completion, the main window should surface a single toast: `Exercise complete · 62 WPM · 96% accuracy · View result`. The "View result" link scrolls the main window's exercise detail to the new attempt row. Borrowed shape from the Instacart feedback toast ([screen 896a3fe5](https://refero.design/pages/896a3fe5-1e39-4de1-9bdb-16482b17b53d)) — single line, single action, dark surface, dismissable.

### Avoid

- Showing a result modal *inside the popup*. The popup's job ends when the exercise ends. Result lives in the main window, not in a window that's about to disappear.
- Toasting from *both* windows. The popup is closing; only the main window toasts.
- Auto-closing the popup without focus handoff. If the user has the browser in front and we silently close the popup with no main-window focus, the completion is invisible.

## 4. Always-on-top affordance (PRD §4.7)

### Borrow

- **The pushpin metaphor.** Every always-on-top control in the wild (Zoom, VLC, IINA, system PiP, MacOS preview windows) uses a pushpin icon, with a 45° tilted variant for the pinned state. No text label. Same control belongs in our drag-region glyph cluster.
- **Reversible without ceremony.** Toggle, not setting. The toggle state is per-popup-window, not global; spawning a new typing popup defaults to unpinned. (If the user pins every popup, that's a candidate for a future preference; not in v0.)
- **Distinction from fullscreen.** Fullscreen is a *separate, OS-level* affordance (the green-light maximize on macOS, F11 on Windows). Soma should not put a fullscreen toggle next to the pin. The popup's whole purpose is *not* being fullscreen — fullscreen would defeat "main window stays usable."

### Avoid

- Always-on-top as a default. Most users would find a window that won't get out of the way more annoying than helpful. Default off; user opts in per session.
- A "stick to corner" magnet behavior (like macOS Stage Manager). Out of scope and platform-fragile (Electron's `setAlwaysOnTop` is reliable; window snapping is not).
- Modifying the OS title bar to indicate pinned state. Use only the in-window pushpin glyph. Cross-platform consistency wins over OS-native conformance for a 28px chrome strip.

## 5. Patterns reviewed but rejected

- **Endless content-picker modals** (e.g. [screen ce6986a1](https://refero.design/pages/ce6986a1-c9be-49d0-88c4-733c7fb8f2cc) and siblings). These are *centered modals over a gradient page* — they read as "popup" semantically but their chrome (close X, content list, page peeking through) is the opposite of what we want. They taught us nothing about a true OS-window popup.
- **ChatGPT temporary chat** ([screen 226d9ff8](https://refero.design/pages/226d9ff8-8e63-44e9-b6b6-4b6b4ca90467)). A "session that ends" pattern, but rendered inline in the main app, not as a separate window. Useful only as confirmation that a "temporary surface ends and main resumes" mental model is mainstream.
- **Promova end-of-quiz feedback modal** ([screen c308df16](https://refero.design/pages/c308df16-c91b-4469-9445-6e05b5e088a7)). Stepper-style modal — totally wrong shape for our completion (which is a one-line toast in the main window).

These are listed so the lock pass doesn't re-discover them.

## 6. Pattern locks (recommendations for ADR-0005)

| PRD ref | Pattern locked from refs | Reference |
|---|---|---|
| §4.7 popup shape | 520×360 default, min-width 480px, chrome auto-hides to 28px drag strip on input focus | Browser PiP / Zoom mini convention (no useful Refero analog) |
| §4.7 chrome | Drag strip (top) · 1px progress bar · body · no footer. Glyph cluster on drag region, flush-right: pin · restart · return-to-main · close | Preply f47cc68d (chrome density), Promova 8ba45dcc (compact header) |
| §4.7 always-on-top | Pushpin glyph, tilted-when-pinned, in-drag-region. Default off, per-window, no global setting in v0 | Cross-product convention (Zoom / VLC / system PiP) |
| §4.7 completion handoff | Popup closes → `app.focus()` main + route to `/practice/<id>` + single toast `Exercise complete · WPM · accuracy · View result` | Zoom call-end + Instacart toast 896a3fe5 |
| §4.7 return-to-main glyph | Fourth glyph in cluster: closes popup, focuses main, leaves exercise state untouched (resumable) | Browser PiP "back to tab" convention |
| §4.7 popup title | Use the exercise's own name as the OS window title (not "Soma — Typing"); identifies the popup in dock / window switcher | MacOS Stickies / dictionary lookup convention |

## 7. Open follow-up

Items where Refero gave no useful signal and we'll need to design from first principles:

- **Popup lifecycle on app quit.** If the user quits Soma with a typing popup open, do we (a) close both, (b) confirm before closing, (c) persist exercise progress and reopen on next launch? No reference points; this is a Soma policy decision tied to the broader "unsaved work" story.
- **Multi-popup behavior.** PRD §4.7 says the mechanism will host exams + surveys later. If a user has a typing popup *and* a survey popup open simultaneously, do they share the always-on-top z-order? Do they cascade-position? Refero can't help (no app indexed runs multi-popup). Needs a `WindowManager` policy in the napi addon layer.
- **Reopening behavior.** Does "Open in window" from the same exercise twice spawn a second window or focus the existing one? Lean toward focus-existing (single instance per exercise id), but this is a UX call worth testing.
- **Window restoration.** If the popup is dragged to a second monitor and that monitor is later disconnected, where does it reappear? Electron has APIs for this but no reference UX to copy — we'll just adopt platform defaults and revisit if it surfaces.
- **Accessibility of the auto-hiding chrome.** Keyboard-only users can't "hover to reveal" the glyph cluster. Need a focusable trigger (Tab into the drag region) — no reference found, design from a11y first principles.

---

_Next step: fold the §6 locks into ADR-0005 alongside the locks from the original refs doc. The follow-ups in §7 are flagged for a separate "popup lifecycle" mini-spec before the §4.7 implementation lands._
