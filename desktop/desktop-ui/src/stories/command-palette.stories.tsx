import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Clock, FileText, Hash, Layers, Search, Settings } from "react-feather";

import {
	type CommandPaletteItem,
	CommandPalette,
} from "../components/overlays/command-palette";

const meta = {
	title: "Overlays/CommandPalette",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const buildItems = (onPick: (label: string) => void): CommandPaletteItem[] => [
	{
		id: "recent-1",
		title: "ADR-0005 UI Revamp v0",
		subtitle: "Project Soma · 2h ago",
		section: "recent-docs",
		icon: <Clock className="size-3.5" />,
		onSelect: () => onPick("recent · ADR-0005"),
	},
	{
		id: "recent-2",
		title: "Daily journal",
		subtitle: "Notes · yesterday",
		section: "recent-docs",
		icon: <Clock className="size-3.5" />,
		onSelect: () => onPick("recent · journal"),
	},
	{
		id: "space-1",
		title: "Project Soma",
		subtitle: "Owner",
		section: "spaces",
		icon: <Layers className="size-3.5" />,
		onSelect: () => onPick("space · soma"),
	},
	{
		id: "space-2",
		title: "Personal",
		subtitle: "Local-only",
		section: "spaces",
		icon: <Layers className="size-3.5" />,
		onSelect: () => onPick("space · personal"),
	},
	{
		id: "doc-1",
		title: "Architecture",
		subtitle: "Project Soma › Architecture",
		section: "documents",
		icon: <FileText className="size-3.5" />,
		onSelect: () => onPick("doc · architecture"),
	},
	{
		id: "doc-2",
		title: "Runbooks",
		subtitle: "Project Soma › Architecture › Runbooks",
		section: "documents",
		icon: <FileText className="size-3.5" />,
		onSelect: () => onPick("doc · runbooks"),
	},
	{
		id: "cmd-settings",
		title: "Open space settings",
		shortcut: "⌘,",
		section: "commands",
		icon: <Settings className="size-3.5" />,
		onSelect: () => onPick("cmd · settings"),
	},
	{
		id: "cmd-new-doc",
		title: "New document",
		shortcut: "⌘N",
		section: "commands",
		icon: <Hash className="size-3.5" />,
		onSelect: () => onPick("cmd · new-doc"),
	},
	{
		id: "cmd-search",
		title: "Search across all spaces",
		shortcut: "⌘⇧F",
		section: "commands",
		icon: <Search className="size-3.5" />,
		onSelect: () => onPick("cmd · search"),
	},
];

function Demo() {
	const [open, setOpen] = useState(true);
	const [picked, setPicked] = useState<string | null>(null);
	const items = buildItems((label) => setPicked(label));
	return (
		<div className="flex h-screen flex-col items-center justify-center gap-3 bg-base-100 p-6">
			<button
				className="rounded-md border border-base-300 bg-base-100 px-3 py-1.5 text-ui-sm"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				{open ? "Close palette" : "Open palette (⌘K)"}
			</button>
			<div className="text-base-content/60 text-ui-xs">
				Last picked: <code className="font-mono">{picked ?? "—"}</code>
			</div>
			<CommandPalette
				items={items}
				onClose={() => setOpen(false)}
				onOpen={() => setOpen(true)}
				open={open}
			/>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => <Demo />,
};
