import type { Meta, StoryObj } from "@storybook/react";
import { Copy, Edit, FileText, Folder, Star, Trash2 } from "react-feather";
import {
	MenuItem,
	MenuSectionLabel,
	MenuShell,
} from "../components/overlays/menu-shell";

const meta = {
	title: "Overlays/MenuShell",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicMenu: Story = {
	render: () => (
		<div className="flex gap-8">
			<MenuShell>
				<MenuItem icon={<Copy size={14} />} label="Copy" shortcut="⌘C" />
				<MenuItem icon={<Edit size={14} />} label="Rename" />
				<MenuItem icon={<Trash2 size={14} />} label="Delete" tone="danger" />
			</MenuShell>
		</div>
	),
};

export const WithSections: Story = {
	render: () => (
		<MenuShell width="w-56">
			<MenuSectionLabel>Files</MenuSectionLabel>
			<MenuItem icon={<FileText size={14} />} label="New file" shortcut="⌘N" />
			<MenuItem icon={<Folder size={14} />} label="New folder" />
			<MenuSectionLabel>Edit</MenuSectionLabel>
			<MenuItem icon={<Copy size={14} />} label="Copy" shortcut="⌘C" />
			<MenuItem icon={<Edit size={14} />} label="Paste" shortcut="⌘V" />
			<MenuSectionLabel>Danger zone</MenuSectionLabel>
			<MenuItem icon={<Trash2 size={14} />} label="Delete" tone="danger" />
		</MenuShell>
	),
};

export const AllTones: Story = {
	render: () => (
		<div className="flex gap-8">
			<div className="space-y-1">
				<p className="mb-2 text-base-content/60 text-xs uppercase">Default</p>
				<MenuShell>
					<MenuItem label="Default row" />
					<MenuItem label="Active row" active />
					<MenuItem label="Disabled row" disabled />
				</MenuShell>
			</div>
			<div className="space-y-1">
				<p className="mb-2 text-base-content/60 text-xs uppercase">Danger</p>
				<MenuShell>
					<MenuItem label="Danger row" tone="danger" />
					<MenuItem label="Active danger" tone="danger" active />
					<MenuItem label="Disabled danger" tone="danger" disabled />
				</MenuShell>
			</div>
		</div>
	),
};

export const WithShortcuts: Story = {
	render: () => (
		<MenuShell width="w-64">
			<MenuItem icon={<Copy size={14} />} label="Copy" shortcut="⌘C" />
			<MenuItem icon={<Edit size={14} />} label="Cut" shortcut="⌘X" />
			<MenuItem icon={<FileText size={14} />} label="Paste" shortcut="⌘V" />
			<MenuItem icon={<Star size={14} />} label="Favourite" shortcut="⌘⇧S" />
		</MenuShell>
	),
};

export const NoIcons: Story = {
	render: () => (
		<MenuShell>
			<MenuItem label="Option A" />
			<MenuItem label="Option B" />
			<MenuItem label="Option C" active />
			<MenuItem label="Option D (danger)" tone="danger" />
		</MenuShell>
	),
};

export const WideShell: Story = {
	render: () => (
		<MenuShell width="w-80">
			<MenuSectionLabel>Recent pages</MenuSectionLabel>
			<MenuItem
				icon={<FileText size={14} />}
				label="Architecture overview"
				shortcut="↩"
			/>
			<MenuItem
				icon={<FileText size={14} />}
				label="Runbooks — incident response"
			/>
			<MenuItem
				icon={<FileText size={14} />}
				label="Wave 3 / PR review notes"
				disabled
			/>
		</MenuShell>
	),
};
