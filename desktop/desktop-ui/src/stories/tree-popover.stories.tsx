import type { Meta, StoryObj } from "@storybook/react";

import {
	type TreeDoc,
	TreePopover,
} from "../components/nav/tree-popover";

const meta = {
	title: "Nav/TreePopover",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const DOCS: TreeDoc[] = [
	{ id: "root-1", title: "Project Soma", starred: true },
	{ id: "root-1-1", title: "Architecture", parentId: "root-1" },
	{ id: "root-1-1-1", title: "ADRs", parentId: "root-1-1" },
	{ id: "root-1-1-2", title: "Runbooks", parentId: "root-1-1" },
	{ id: "root-1-2", title: "Design system", parentId: "root-1" },
	{ id: "root-2", title: "Notes" },
	{ id: "root-2-1", title: "Daily journal", parentId: "root-2" },
	{ id: "root-2-2", title: "Reading list", parentId: "root-2", starred: true },
	{ id: "root-3", title: "Inbox" },
];

const RECENTS = ["root-1-1-1", "root-2-1", "root-1-2"];

export const Default: Story = {
	render: () => (
		<div className="flex justify-center">
			<TreePopover
				currentId="root-1-1-1"
				documents={DOCS}
				onClose={() => undefined}
				onSelect={(id) => console.log("open", id)}
				onSelectInNewTab={(id) => console.log("open in new tab", id)}
				recentIds={RECENTS}
			/>
		</div>
	),
};

export const NoRecents: Story = {
	render: () => (
		<div className="flex justify-center">
			<TreePopover
				currentId="root-1"
				documents={DOCS}
				onClose={() => undefined}
				onSelect={() => undefined}
			/>
		</div>
	),
};

export const NoStarred: Story = {
	render: () => (
		<div className="flex justify-center">
			<TreePopover
				documents={DOCS.map(({ starred: _starred, ...rest }) => rest)}
				onClose={() => undefined}
				onSelect={() => undefined}
				recentIds={RECENTS}
			/>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="flex justify-center bg-base-100 p-6">
			<TreePopover
				currentId="root-1-1-1"
				documents={DOCS}
				onClose={() => undefined}
				onSelect={() => undefined}
				onSelectInNewTab={() => undefined}
				recentIds={RECENTS}
			/>
		</div>
	),
};
