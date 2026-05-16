# UI Framework Candidates

Soma and Tapia currently use React 19, Tailwind CSS v4, DaisyUI, Floating UI, Motion, and a shared @soma/ui package. That works, but DaisyUI is carrying too much visual opinion into an app that wants a dense, native-feeling desktop surface.

## What We Need

- Headless or lightly styled primitives so `@soma/ui` remains the design-system boundary.
- Strong accessibility defaults for menus, dialogs, comboboxes, tabs, toolbars, trees, and keyboard navigation.
- Tailwind-compatible styling with no mandatory CSS-in-JS runtime.
- React 19 compatibility and good behavior inside Electron/Chromium.
- Composable APIs that can support Soma's workspace shell and Tapia's focused interaction states without fighting Motion.

## Leading Candidate: Base UI

[Base UI](https://base-ui.com/react/overview/about) is the best first candidate to prototype. It is an unstyled React component library focused on accessibility, performance, and developer experience, and its docs explicitly support Tailwind, CSS modules, plain CSS, and CSS-in-JS.

Why it fits Soma:

- It lets us keep Tailwind v4 and `@soma/ui` as the visible design layer.
- It avoids DaisyUI's global class vocabulary and theme assumptions.
- It gives us accessible primitive behavior without forcing a product look.
- It comes from maintainers with Radix, Floating UI, Material UI, and Base UI lineage, which matters for the exact overlay/menu/focus problems desktop apps tend to hit.

Recommended experiment:

1. Pick one overlay-heavy component, probably command palette or context menu.
2. Rebuild it behind the same `@soma/ui` export using Base UI primitives.
3. Compare keyboard behavior, focus restore, animation hooks, bundle impact, and styling friction.
4. Keep DaisyUI available during the experiment, but avoid new DaisyUI-only APIs.

## Other Candidates

| Candidate | Fit | Concern |
| --- | --- | --- |
| [React Aria Components](https://react-spectrum.adobe.com/react-aria/components.html) | Best accessibility depth and broad component coverage. | API and styling model may feel heavier than we need for a custom desktop shell. |
| [Ark UI](https://ark-ui.com/react/docs/overview/introduction) | Headless, accessible, broad component set, and a state-machine flavor that could pair well with Tapia. | Multi-framework abstraction may add concepts we do not need in a React-only Electron app. |
| [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) | Mature low-level primitives, familiar ecosystem, good fit for shadcn-style wrappers. | Base UI looks like the fresher direction for this exact unstyled React primitive layer. |
| [Mantine](https://mantine.dev/) | Very productive full component library with many hooks and ready-made controls. | More of a replacement design system than a primitive layer; likely too opinionated for `@soma/ui`. |
| [Chakra UI](https://chakra-ui.com/docs/components/concepts/overview) | Complete component inventory and strong composability story. | Its styling/runtime model is a larger departure from Tailwind-first desktop UI. |

## VitePress Compatibility

Do not add Chakra UI directly to the VitePress docs theme. Chakra UI is a React component library, while VitePress is Vue-powered. We can still document Chakra UI here as a candidate for the Electron apps, but using it inside the docs site would require a React island or iframe bridge and would add framework complexity to a content-first site.

If the docs need richer interactive examples, prefer one of these:

1. Keep the VitePress shell Vue-native and link to Storybook examples under `/storybook`.
2. Build small docs-only Vue components for simple interactivity.
3. Embed a React example as an isolated iframe only when it demonstrates real `@soma/ui` behavior.

## Provisional Direction

Prototype Base UI inside @soma/ui first. If it feels too immature or thin for complex accessibility cases, compare the same component against React Aria Components. Avoid a wholesale framework migration until one vertical slice proves better behavior than the current DaisyUI-based implementation.
