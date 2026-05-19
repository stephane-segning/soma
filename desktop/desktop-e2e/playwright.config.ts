import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// playwright-bdd generates Playwright tests from `.feature` files. The
// generated specs land in `.features-gen/` and are picked up by the
// `testDir` below. Run `pnpm bdd` to regenerate, or rely on `pnpm test`
// which runs `bddgen` first.
const testDir = defineBddConfig({
	features: ["features/**/*.feature"],
	steps: ["steps/**/*.ts"],
});

const STORYBOOK_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:6006";
const STARTUP_TIMEOUT_MS = 120_000;

export default defineConfig({
	testDir,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["html", { open: "never" }], ["list"]],
	use: {
		baseURL: STORYBOOK_URL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				// Reuse the workspace's Storybook dev server when running E2E
				// locally. In CI we point at a pre-built static export via
				// `E2E_BASE_URL` instead (see test workflow).
				command: "pnpm --filter @soma/ui run storybook -- --ci",
				url: STORYBOOK_URL,
				reuseExistingServer: !process.env.CI,
				timeout: STARTUP_TIMEOUT_MS,
				cwd: "../..",
			},
});
