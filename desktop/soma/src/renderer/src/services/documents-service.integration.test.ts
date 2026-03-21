import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const createId = vi.fn(() => "generated-page-id");

vi.mock("../lib/ipc", () => ({
	invoke,
}));

vi.mock("@paralleldrive/cuid2", () => ({
	createId,
}));

describe("documents service", () => {
	beforeEach(() => {
		vi.resetModules();
		invoke.mockReset();
		createId.mockClear();
	});

	it("fills in page ids and parent ids when creating pages", async () => {
		invoke.mockResolvedValue({ pageId: "generated-page-id" });
		const service = await import("./documents-service");

		await service.ensurePage({ spaceId: "space_1" });

		expect(invoke).toHaveBeenCalledWith("documents_ensure_page", {
			spaceId: "space_1",
			pageId: "generated-page-id",
			title: undefined,
			parentPageIds: [],
		});
	});

	it("returns an empty list when page listing fails", async () => {
		invoke.mockRejectedValue(new Error("offline"));
		const service = await import("./documents-service");

		await expect(service.listPages({ spaceId: "space_1" })).resolves.toEqual([]);
	});

	it("returns null when page title updates fail", async () => {
		invoke.mockRejectedValue(new Error("failed"));
		const service = await import("./documents-service");

		await expect(service.updatePageTitle({ spaceId: "space_1", pageId: "page_1", title: "Notes" })).resolves.toBeNull();
	});
});
