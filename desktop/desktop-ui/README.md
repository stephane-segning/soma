# desktop-ui

Shared layout + overlay components for Soma and Tapia desktop apps. Ships Tailwind v4 + DaisyUI styling, Motion animations, dnd-kit for desktop icons, and Storybook for rapid prototyping.

## Usage

```tsx
import "@soma/ui/styles.css";
import { DesktopArea, DesktopShell, Dock, Taskbar, notify } from "@soma/ui";

export function Shell() {
  return (
    <DesktopShell
      taskbar={<Taskbar apps={[]} />}
      dock={<Dock apps={[]} />}
    >
      <DesktopArea
        items={[{ id: "notes", label: "Notes" }]}
        onActivate={(item) => notify.success(`Open ${item.label}`)}
      />
    </DesktopShell>
  );
}
```

- `pnpm dev` → Storybook
- `pnpm build` → bundle + CSS in `dist/`
- `pnpm build:storybook` → static Storybook output
