import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given, When, Then } = createBdd();

// Storybook's iframe URL accepts `?id=<kebab-of-title>--<kebab-of-story>`.
// The catalog landing page is `/?path=/docs/foundation-tokens--docs` or
// similar; for direct story rendering we hit `iframe.html?id=...` and
// scope assertions to the storybook root.
function storyId(title: string, storyName: string): string {
	// Mirrors Storybook's internal id generator: kebab-case, ASCII-only,
	// collapse repeats, trim leading/trailing hyphens.
	const slug = (s: string) =>
		s
			.toLowerCase()
			.replace(/\//g, "-")
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/(^-|-$)/g, "");
	return `${slug(title)}--${slug(storyName)}`;
}

Given("the Storybook catalog is open", async ({ page }) => {
	// Relative path (no leading slash) preserves any subpath in
	// `baseURL` — e.g. `https://soma.vaam.store/storybook/` stays intact
	// when running against the published gh-pages mirror.
	await page.goto("./");
	await expect(page).toHaveTitle(/Storybook|@soma\/ui/);
});

When("I look at the catalog sidebar", async ({ page }) => {
	// Storybook's sidebar is rendered in the host frame.
	await expect(page.locator("nav, [role='navigation']")).toBeVisible({
		timeout: 15_000,
	});
});

Then("I see a {string} group", async ({ page }, group: string) => {
	await expect(
		page.getByRole("button", { name: new RegExp(group, "i") }).first(),
	).toBeVisible({ timeout: 15_000 });
});

When(
	"I open the {string} story {string}",
	async ({ page }, title: string, storyName: string) => {
		const id = storyId(title, storyName);
		// Relative `iframe.html` — see the comment on `page.goto("./")`
		// above for why we avoid leading-slash paths here.
		await page.goto(`iframe.html?id=${id}&viewMode=story`);
		// The iframe target renders the story directly into `#storybook-root`.
		await expect(page.locator("#storybook-root")).toBeVisible({
			timeout: 15_000,
		});
	},
);

Then(
	"the preview frame contains {string}",
	async ({ page }, fragment: string) => {
		await expect(page.locator("#storybook-root")).toContainText(fragment);
	},
);

Then("the preview frame is not blank", async ({ page }) => {
	const text = await page.locator("#storybook-root").innerText();
	expect(text.trim().length).toBeGreaterThan(0);
});
