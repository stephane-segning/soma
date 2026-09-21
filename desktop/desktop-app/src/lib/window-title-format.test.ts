import { describe, expect, it } from "vitest";
import { formatWindowTitle } from "./window-title-format";

describe("formatWindowTitle", () => {
	it("uses the app title when there is no active space", () => {
		expect(formatWindowTitle({ appTitle: "Soma" })).toBe("Soma");
		expect(formatWindowTitle({ appTitle: "Soma", spaceName: null, pageTitle: null })).toBe("Soma");
	});

	it("uses the space name alone when there is no active page", () => {
		expect(formatWindowTitle({ appTitle: "Soma", spaceName: "Personal" })).toBe("Personal");
	});

	it("combines page and space when both are known", () => {
		expect(formatWindowTitle({ appTitle: "Soma", spaceName: "Personal", pageTitle: "Roadmap" })).toBe(
			"Roadmap — Personal",
		);
	});

	it("ignores a page title with no resolved space name", () => {
		// Shouldn't happen in practice (the hook only looks up the page
		// once the space resolved), but the formatter itself should still
		// degrade sanely rather than showing a bare page title with no
		// context.
		expect(formatWindowTitle({ appTitle: "Soma", spaceName: null, pageTitle: "Roadmap" })).toBe("Soma");
	});

	it("falls back to the app title for an empty space name", () => {
		expect(formatWindowTitle({ appTitle: "Soma", spaceName: "" })).toBe("Soma");
	});
});
