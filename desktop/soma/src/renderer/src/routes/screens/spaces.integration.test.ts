import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listSpaces = vi.fn();

vi.mock("@app/services/spaces-service.ts", () => ({
	listSpaces,
}));

describe("spaces loader", () => {
	beforeEach(() => {
		vi.resetModules();
		listSpaces.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("redirects to the landing screen when the device has no spaces", async () => {
		listSpaces.mockResolvedValue({ spaces: [] });
		const { loader } = await import("./spaces");

		const response = await loader();
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/spaces/landing");
	});

	it("redirects to the first space when one exists", async () => {
		listSpaces.mockResolvedValue({ spaces: [{ spaceId: "space_123" }] });
		const { loader } = await import("./spaces");

		const response = await loader();
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/spaces/space_123/pages");
	});

	it("redirects to settings when spaces cannot load", async () => {
		listSpaces.mockRejectedValue(new Error("daemon unavailable"));
		const { loader } = await import("./spaces");

		const response = await loader();
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/settings");
	});
});
