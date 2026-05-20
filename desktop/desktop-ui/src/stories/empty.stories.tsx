import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Inbox } from "react-feather";
import { Empty } from "../components/primitives/empty";

const meta = {
	title: "Primitives/Empty",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {
	render: () => (
		<div className="max-w-xl">
			<Empty
				cta={
					<button
						className="btn btn-primary btn-sm"
						onClick={() => undefined}
						type="button"
					>
						Add bot
					</button>
				}
				headline="No bots in this space yet"
				icon={<Inbox aria-hidden />}
				subtext="Paste a bot's peer address from settings to authorize it."
			/>
		</div>
	),
};

export const FullNoCta: Story = {
	render: () => (
		<div className="max-w-xl">
			<Empty
				headline="No documents yet"
				icon={<Inbox aria-hidden />}
				subtext="Once you create one, it'll show up here."
			/>
		</div>
	),
};

export const Compact: Story = {
	render: () => (
		<div className="max-w-sm">
			<Empty headline="No attachments" variant="compact" />
		</div>
	),
};

function FilterDemo() {
	const [cleared, setCleared] = useState(false);
	if (cleared) {
		return (
			<div className="max-w-sm text-sm text-base-content/60">
				Filter cleared
			</div>
		);
	}
	return (
		<div className="max-w-sm">
			<Empty
				headline="No matches for 'foo'"
				onClear={() => setCleared(true)}
				variant="filter"
			/>
		</div>
	);
}

export const Filter: Story = {
	render: () => <FilterDemo />,
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="flex flex-col gap-4 bg-base-100 p-4">
			<Empty
				headline="No bots in this space yet"
				icon={<Inbox aria-hidden />}
				subtext="Paste a bot's peer address from settings to authorize it."
			/>
			<Empty headline="No attachments" variant="compact" />
			<Empty
				headline="No matches for 'foo'"
				onClear={() => undefined}
				variant="filter"
			/>
		</div>
	),
};
