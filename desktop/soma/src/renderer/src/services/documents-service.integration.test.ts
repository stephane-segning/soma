import { beforeEach, describe, expect, it, vi } from "vitest";

const pages = {
	ensure: vi.fn(),
	list: vi.fn(),
	updateTitle: vi.fn(),
	setParents: vi.fn(),
};
const documents = {
	getDraft: vi.fn(),
	upsertDraft: vi.fn(),
	queueDaemonSync: vi.fn(),
	syncPublishedDocument: vi.fn(),
};
const createId = vi.fn(() => "generated-page-id");

vi.mock("../lib/ipc", () => ({
	backend: { pages, documents },
	invoke: vi.fn(),
}));

vi.mock("@paralleldrive/cuid2", () => ({
	createId,
}));

describe("documents service", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const fn of Object.values(pages)) fn.mockReset();
		for (const fn of Object.values(documents)) fn.mockReset();
		createId.mockClear();
	});

	it("fills in page ids and parent ids when creating pages", async () => {
		pages.ensure.mockResolvedValue({ pageId: "generated-page-id" });
		const service = await import("./documents-service");

		await service.ensurePage({ spaceId: "space_1" });

		expect(pages.ensure).toHaveBeenCalledWith({
			spaceId: "space_1",
			pageId: "generated-page-id",
			title: "",
			parentPageIds: [],
		});
	});

	it("returns an empty list when page listing fails", async () => {
		pages.list.mockRejectedValue(new Error("offline"));
		const service = await import("./documents-service");

		await expect(service.listPages({ spaceId: "space_1" })).resolves.toEqual([]);
	});

	it("returns null when page title updates fail", async () => {
		pages.updateTitle.mockRejectedValue(new Error("failed"));
		const service = await import("./documents-service");

		await expect(service.updatePageTitle({ spaceId: "space_1", pageId: "page_1", title: "Notes" })).resolves.toBeNull();
	});
});
