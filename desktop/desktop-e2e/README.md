# @soma/e2e — Cucumber × Playwright UI smoke suite

Gherkin features in `features/`, step definitions in `steps/`,
[playwright-bdd](https://vitalets.github.io/playwright-bdd/) compiles them
into Playwright specs at runtime.

## Run locally

```bash
pnpm --filter @soma/e2e install:browsers   # one-time
pnpm --filter @soma/e2e test               # boots @soma/ui storybook + runs features
pnpm --filter @soma/e2e test:ui            # Playwright UI mode
pnpm --filter @soma/e2e report             # last HTML report
```

The default config starts `pnpm --filter @soma/ui run storybook` and points
Playwright at `http://127.0.0.1:6006`. Set `E2E_BASE_URL` to skip the dev
server and target a deployed catalog — for example the published GitHub
Pages mirror:

```bash
E2E_BASE_URL=https://soma.vaam.store/storybook pnpm --filter @soma/e2e test
```

## CI

The repo's `test` workflow (`.github/workflows/test.yml`) builds Storybook
into `desktop/desktop-ui/storybook-static`, serves it with `npx serve`, and
runs the suite against that mirror so the same catalog that ships to
gh-pages is exercised before publish.

## Adding a feature

1. Drop a `.feature` file under `features/`.
2. Implement the steps in `steps/*.ts` (one file per feature is fine).
3. Run `pnpm --filter @soma/e2e test` — the suite regenerates specs.

Step names match exactly, including punctuation. Capture groups use
`{string}` and `{int}` per the Cucumber expression syntax.
