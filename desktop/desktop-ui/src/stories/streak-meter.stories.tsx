import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
	StreakMeter,
	TimerPill,
	XpMeter,
} from "../components/progress/streak-meter";

const meta = {
	title: "Progress/Meters",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StreakMeterStory: Story = {
	name: "StreakMeter",
	render: () => (
		<div className="flex max-w-sm flex-col gap-4">
			<StreakMeter value={0} />
			<StreakMeter value={3} />
			<StreakMeter value={7} />
			<StreakMeter label="Daily streak" max={14} value={9} />
		</div>
	),
};

export const XpMeterStory: Story = {
	name: "XpMeter",
	render: () => (
		<div className="flex max-w-sm flex-col gap-4">
			<XpMeter max={1000} value={0} />
			<XpMeter max={1000} value={350} />
			<XpMeter max={1000} value={1000} />
			<XpMeter label="Level XP" max={500} value={423} />
		</div>
	),
};

export const TimerPillStory: Story = {
	name: "TimerPill",
	render: () => (
		<div className="flex flex-wrap gap-3">
			<TimerPill accent="primary" timecode="01:30" />
			<TimerPill accent="success" label="Focus" timecode="25:00" />
			<TimerPill accent="warning" label="Break" timecode="00:47" />
			<TimerPill accent="danger" label="Overdue" timecode="00:00" />
		</div>
	),
};

export const AllTogether: Story = {
	render: () => (
		<div className="max-w-sm space-y-4">
			<StreakMeter label="Practice streak" max={7} value={5} />
			<XpMeter label="Session XP" max={200} value={120} />
			<div className="flex gap-3">
				<TimerPill accent="success" label="Focus" timecode="18:22" />
				<TimerPill accent="warning" label="Break" timecode="04:59" />
			</div>
		</div>
	),
};

export const InteractiveStreak: Story = {
	render: function InteractiveStory() {
		const [value, setValue] = useState(3);
		return (
			<div className="max-w-sm space-y-4">
				<StreakMeter max={7} value={value} />
				<input
					className="range range-warning w-full"
					max={7}
					min={0}
					onChange={(e) => setValue(Number(e.target.value))}
					type="range"
					value={value}
				/>
				<p className="text-base-content/60 text-sm">
					Drag the slider to update the streak.
				</p>
			</div>
		);
	},
};
