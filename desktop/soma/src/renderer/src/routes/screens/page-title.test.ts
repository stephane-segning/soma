import { describe, expect, it } from "vitest";
import { deriveTitleFromDocument, shouldSyncDerivedTitle, UNTITLED_PAGE_TITLE } from "./page-title";

describe("deriveTitleFromDocument", () => {
	it("falls back to Untitled for empty content", () => {
		expect(deriveTitleFromDocument(undefined)).toBe(UNTITLED_PAGE_TITLE);
	});

	it("uses the first meaningful line from the document", () => {
		expect(
			deriveTitleFromDocument({
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "text", text: "   " }] },
					{ type: "heading", content: [{ type: "text", text: "Sprint review notes" }] },
				],
			}),
		).toBe("Sprint review notes");
	});
});

describe("shouldSyncDerivedTitle", () => {
	it("keeps syncing while a page still uses the default title", () => {
		expect(
			shouldSyncDerivedTitle({
				currentPageTitle: UNTITLED_PAGE_TITLE,
				lastSyncedTitle: null,
				nextDerivedTitle: "Meeting notes",
			}),
		).toBe(true);
	});

	it("does not overwrite a custom page title that was never auto-synced", () => {
		expect(
			shouldSyncDerivedTitle({
				currentPageTitle: "Quarterly recap",
				lastSyncedTitle: null,
				nextDerivedTitle: "Meeting notes",
			}),
		).toBe(false);
	});

	it("continues syncing titles after an auto-generated title changes", () => {
		expect(
			shouldSyncDerivedTitle({
				currentPageTitle: "Meeting notes",
				lastSyncedTitle: "Meeting notes",
				nextDerivedTitle: "Meeting notes follow-up",
			}),
		).toBe(true);
	});
});
