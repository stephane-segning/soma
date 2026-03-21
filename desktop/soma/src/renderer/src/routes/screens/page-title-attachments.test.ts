import { describe, expect, it } from "vitest";
import { deriveTitleFromDocument, isDocumentEffectivelyEmpty } from "./page-title";

describe("page title attachment fallbacks", () => {
	it("uses an attachment name when a page has no text yet", () => {
		expect(
			deriveTitleFromDocument({
				type: "doc",
				content: [
					{
						type: "blobFile",
						attrs: {
							originalName: "Quarterly-plan.pdf",
						},
					},
				],
			}),
		).toBe("Quarterly-plan.pdf");
	});

	it("treats attachment-only pages as non-empty", () => {
		expect(
			isDocumentEffectivelyEmpty({
				type: "doc",
				content: [
					{
						type: "blobImage",
						attrs: {
							name: "roadmap-cover.png",
						},
					},
				],
			}),
		).toBe(false);
	});
});
