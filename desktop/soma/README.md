# Soma

## Main process dependency injection

The main process uses InversifyJS for DI. The container lives at `src/main/container.ts` and currently wires the `WindowManager` service (`src/main/services/window-manager.ts`) to handle BrowserWindow creation. Extend the container with additional bindings as new services are added, and import `reflect-metadata` before resolving from the container (done in `src/main/index.ts`).

## Styling utility

Use the shared `cn` helper (`src/renderer/src/lib/cn.ts`) to merge class names. It combines `class-variance-authority`'s `cx` with `tailwind-merge` so Tailwind variants stay deduped and predictable.

## Localization with i18next

Use `react-i18next` with the shared instance at `src/renderer/src/lib/i18n.ts`. It wires `i18next-chained-backend` to combine `i18next-http-backend` (dev-friendly remote loading) and `i18next-resources-to-backend` (bundled dynamic imports for dist), plus `i18next-browser-languagedetector`. Wrap the renderer in `<I18nextProvider i18n={i18n}>` (already done in `src/renderer/src/main.tsx`). Default resources live under `src/renderer/src/locales/`; add more locales/namespaces there and they’ll be included in the final build.

## Routing

Prefer `react-router` core (not `react-router-dom`). In Electron, use `createMemoryRouter` or `createHashRouter` from `react-router` to avoid browser history issues.

## UI component plan (dumb components)

Use `@headlessui/react` for accessible primitives, style with TailwindCSS + DaisyUI tokens, compose variants via `class-variance-authority` + `tailwind-merge` (see `src/renderer/src/lib/cn.ts`), animate with `motion`, and position overlays with `@floating-ui/react`.

Planned components to build for Soma’s renderer:
- Button & IconButton (variants: primary/secondary/ghost; sizes; loading state)
- Input & Textarea (with error/helper text, optional leading/trailing adornments)
- Select/Combobox (Headless UI + Floating UI for positioning)
- Tooltip & Popover (Floating UI positioning; Motion enter/exit)
- Dialog/Modal (Headless UI Dialog + Motion transitions)
- Toast/Notification primitive (portal + Motion; leverages cn helper)
- Tabs & Segmented control (Headless UI Tabs + DaisyUI colors)
- Command palette (react-cmdk styling with cn/tailwind-merge)
- Breadcrumb/Topbar shell pieces (using DaisyUI + cn variants)
