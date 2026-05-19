import { composeStories } from "@storybook/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as EmptyStories from "../empty.stories";
import * as FoundationStories from "../foundation.stories";
import * as PeerAddressInputStories from "../peer-address-input.stories";
import * as PillStories from "../pill.stories";
import * as PolymorphButtonStories from "../polymorph-button.stories";

// Portable-stories smoke harness: every story listed here is composed through
// the Storybook annotations (decorators/parameters) and rendered into jsdom.
// A passing render proves the locked surface mounts without throwing — covers
// the slot a Storybook test runner would otherwise fill, without requiring a
// running browser.
const allStories = {
	Pill: composeStories(PillStories),
	Foundation: composeStories(FoundationStories),
	PolymorphButton: composeStories(PolymorphButtonStories),
	PeerAddressInput: composeStories(PeerAddressInputStories),
	Empty: composeStories(EmptyStories),
};

describe("stories smoke", () => {
	for (const [groupName, stories] of Object.entries(allStories)) {
		describe(groupName, () => {
			for (const [storyName, Story] of Object.entries(stories)) {
				it(`renders ${storyName}`, async () => {
					const { container } = render(<Story />);
					// Awaiting story.run() resolves async play() functions where present;
					// the optional chain keeps stories without play() trivially passing.
					await (Story as { run?: () => Promise<void> }).run?.();
					expect(container.firstChild).not.toBeNull();
				});
			}
		});
	}
});
