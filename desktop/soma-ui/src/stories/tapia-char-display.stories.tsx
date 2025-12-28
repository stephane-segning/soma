import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CharDisplay } from "../components/tapia/char-display";
import { useGraphemes } from "../hooks/use-graphemes";

const meta: Meta<typeof CharDisplay> = {
	title: "Tapia/Char Display",
	component: CharDisplay,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CharDisplay>;

export const Default: Story = {
	render: () => {
		const should = useGraphemes(
			"I love keyboard ❤️! It's so wonderful to code when you're not hungry or afraid of a computer aha hahaha.",
		);
		const is = useGraphemes("I lovee b");
		return (
			<div className="space-y-3 p-8 bg-base-100">
				<CharDisplay shouldGraphemes={should} isGraphemes={is} />
			</div>
		);
	},
};

export const LiveTyping: Story = {
	render: () => {
		const [value, setValue] = useState("keyv");
		const should = useGraphemes(
			"I love keyboard ❤️! It's so wonderful to code when you're not hungry or afraid of a computer aha hahaha.",
		);
		const is = useGraphemes(value);
		return (
			<div className="space-y-3 p-8 bg-base-100 w-full">
				<CharDisplay shouldGraphemes={should} isGraphemes={is} />
				<input
					value={value}
					onChange={(event) => setValue(event.target.value)}
					placeholder="Type to compare"
					className="input input-bordered input-sm w-full max-w-xs"
				/>
			</div>
		);
	},
};
