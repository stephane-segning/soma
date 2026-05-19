/**
 * Regression test — when `loading` is true the spinner replaces the
 * leading/trailing icon rather than rendering alongside it. Before
 * the fix the spinner and the icon both rendered, which felt noisy
 * and shifted the label as soon as loading flipped on.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PolymorphButton } from "./polymorph-button";

function Icon() {
	return <span data-testid="leading-icon">▶</span>;
}
function TrailingIcon() {
	return <span data-testid="trailing-icon">↗</span>;
}

describe("PolymorphButton loading state", () => {
	it("renders both icons when not loading", () => {
		const { queryByTestId, container } = render(
			<PolymorphButton leadingIcon={<Icon />} trailingIcon={<TrailingIcon />}>
				Go
			</PolymorphButton>,
		);
		expect(queryByTestId("leading-icon")).not.toBeNull();
		expect(queryByTestId("trailing-icon")).not.toBeNull();
		// No spinner element when not loading.
		expect(container.querySelector(".loading-spinner")).toBeNull();
	});

	it("hides leading + trailing icons and shows spinner while loading", () => {
		const { queryByTestId, container } = render(
			<PolymorphButton leadingIcon={<Icon />} loading trailingIcon={<TrailingIcon />}>
				Go
			</PolymorphButton>,
		);
		expect(queryByTestId("leading-icon")).toBeNull();
		expect(queryByTestId("trailing-icon")).toBeNull();
		expect(container.querySelector(".loading-spinner")).not.toBeNull();
	});

	it("sets aria-busy while loading for assistive tech", () => {
		const { getByRole } = render(<PolymorphButton loading>Go</PolymorphButton>);
		expect(getByRole("button").getAttribute("aria-busy")).toBe("true");
	});
});
