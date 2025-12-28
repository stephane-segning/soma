import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CharDisplay } from "../components/tapia/char-display";

const meta: Meta<typeof CharDisplay> = {
	title: "Tapia/Char Display",
	component: CharDisplay,
	parameters: { layout: "padded" },
	args: {
		shouldText: "I love keyboard ❤️!",
		isText: "I lovee b",
	},
};

export default meta;
type Story = StoryObj<typeof CharDisplay>;

export const Default: Story = {
	render: (args) => {
		return (
			<div className="space-y-3 p-8 bg-base-100">
				<CharDisplay {...args} />
			</div>
		);
	},
};

export const LiveTyping: Story = {
	render: (args) => {
		const [value, setValue] = useState("keyv");
		return (
			<div className="space-y-3 p-8 bg-base-100">
				<CharDisplay {...args} isText={value} />
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
