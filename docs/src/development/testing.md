# Testing

The desktop workspace ships three test surfaces. The `test.yml` GitHub
workflow runs the first two on every PR; the third is opt-in locally and
gates the gh-pages deploy.

## Unit tests with coverage

Both `@soma/ui` and the `soma` renderer use [Vitest](https://vitest.dev)
under jsdom with `@vitest/coverage-v8`. Coverage reports land in
`<package>/coverage/` (HTML + lcov + `coverage-summary.json`) and CI
uploads them as artifacts.

```bash
just desktop-test-unit            # both packages, coverage on
pnpm --filter @soma/ui run test   # @soma/ui only, no coverage
pnpm --filter soma   run test     # soma only, no coverage
```

`@soma/ui` reuses the Storybook preview annotations
([decorators + parameters](https://storybook.js.org/docs/writing-tests/portable-stories-vitest))
via `setProjectAnnotations` in `vitest.setup.ts`, so every story file is
testable through `composeStories(...)` — the same Intl, density, theme,
and memory-router context that runs in Storybook. A smoke harness in
`src/stories/__tests__/stories-smoke.test.tsx` renders the curated set;
new stories drop in by adding an `import * as Stories from "..."` line.

## UI E2E (Cucumber × Playwright)

`desktop/desktop-e2e/` holds Gherkin features + step definitions, compiled
to Playwright specs by [`playwright-bdd`](https://vitalets.github.io/playwright-bdd/).
The default target is the @soma/ui Storybook — same artifact we publish to
[`/storybook/`](https://soma.vaam.store/storybook/) on gh-pages. CI builds
the catalog, serves the static export, and runs the suite against it
before publish.

```bash
just desktop-test-e2e                                   # local: boots storybook + runs
E2E_BASE_URL=https://soma.vaam.store/storybook \
    pnpm --filter @soma/e2e run test                    # against the live mirror
```

See `desktop/desktop-e2e/README.md` for the step library + how to add a
new feature.

## Storybook on GitHub Pages

`just docs-build` builds VitePress into `./site` *and* the @soma/ui
Storybook into `./site/storybook`. The `release-pages.yml` workflow
publishes that directory as the `gh-pages` branch, served under the
`soma.vaam.store` cname. The result is two routes under one host:

- `https://soma.vaam.store/` — VitePress docs
- `https://soma.vaam.store/storybook/` — Storybook catalog

The VitePress top-nav has a Storybook link; reviewers can poke the locked
v0 surfaces in the browser without checking out the repo.
