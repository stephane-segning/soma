import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
	Bookmark,
	Code,
	Hash,
	Image as ImageIcon,
	List,
	Square,
	Table,
	Type,
} from "react-feather";

import {
	SlashMenu,
	type SlashMenuItem,
} from "../components/editor/slash-menu";

const meta = {
	title: "Editor/SlashMenu",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ITEMS: SlashMenuItem[] = [
	{
		id: "heading-1",
		label: "Heading 1",
		section: "text",
		icon: <Hash className="size-4" />,
		shortcut: "⌘⇧1",
		onSelect: () => undefined,
	},
	{
		id: "heading-2",
		label: "Heading 2",
		section: "text",
		icon: <Hash className="size-4" />,
		shortcut: "⌘⇧2",
		onSelect: () => undefined,
	},
	{
		id: "paragraph",
		label: "Paragraph",
		aliases: ["body", "text"],
		section: "text",
		icon: <Type className="size-4" />,
		onSelect: () => undefined,
	},
	{
		id: "bullet-list",
		label: "Bulleted list",
		aliases: ["ul", "list"],
		section: "list",
		icon: <List className="size-4" />,
		shortcut: "⌘⇧8",
		onSelect: () => undefined,
	},
	{
		id: "task-list",
		label: "Task list",
		aliases: ["todo", "checklist"],
		section: "list",
		icon: <Square className="size-4" />,
		onSelect: () => undefined,
	},
	{
		id: "image",
		label: "Image",
		section: "embed",
		icon: <ImageIcon className="size-4" />,
		onSelect: () => undefined,
	},
	{
		id: "table",
		label: "Table",
		section: "embed",
		icon: <Table className="size-4" />,
		onSelect: () => undefined,
	},
	{
		id: "code-block",
		label: "Code block",
		aliases: ["pre"],
		section: "embed",
		icon: <Code className="size-4" />,
		shortcut: "⌘⇧C",
		onSelect: () => undefined,
	},
	{
		id: "divider",
		label: "Divider",
		section: "action",
		icon: <Bookmark className="size-4" />,
		onSelect: () => undefined,
	},
];

function Demo({
	initialQuery = "",
	withAIFallback = true,
}: {
	initialQuery?: string;
	withAIFallback?: boolean;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [picked, setPicked] = useState<string | null>(null);

	const items = ITEMS.map((item) => ({
		...item,
		onSelect: () => setPicked(`block · ${item.label}`),
	}));

	return (
		<div className="flex max-w-2xl flex-col gap-3 text-ui-sm">
			<div className="rounded-md border border-base-300 bg-base-100 p-3">
				<label className="flex flex-col gap-1">
					<span className="text-base-content/60 text-ui-xs">
						Filter (mock editor text after `/`)
					</span>
					<input
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1 text-body outline-none focus-visible:border-primary"
						onChange={(event) => setQuery(event.target.value)}
						placeholder="type to filter…"
						value={query}
					/>
				</label>
			</div>
			<SlashMenu
				items={items}
				onAIPrompt={
					withAIFallback
						? (prompt) => setPicked(`ai · ${prompt}`)
						: undefined
				}
				onClose={() => setPicked("(closed)")}
				query={query}
			/>
			<div className="text-base-content/60 text-ui-xs">
				Last action: <code className="font-mono">{picked ?? "—"}</code>
			</div>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const Filtered: Story = {
	render: () => <Demo initialQuery="list" />,
};

export const NoBlockMatchAIFallback: Story = {
	render: () => <Demo initialQuery="summarize the last paragraph" />,
};

export const NoBlockMatchNoAIFallback: Story = {
	render: () => (
		<Demo initialQuery="something obscure" withAIFallback={false} />
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-4">
			<Demo />
		</div>
	),
};
