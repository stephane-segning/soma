import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
	AlignCenter,
	AlignLeft,
	Bold,
	Italic,
	Link,
	Underline,
} from "react-feather";
import { BubbleToolbar } from "../components/overlays/bubble-toolbar";

const meta: Meta<typeof BubbleToolbar> = {
	title: "Overlays/BubbleToolbar",
	component: BubbleToolbar,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof BubbleToolbar>;

const textActions = [
	{ id: "bold", icon: <Bold size={14} />, label: "Bold" },
	{ id: "italic", icon: <Italic size={14} />, label: "Italic" },
	{ id: "underline", icon: <Underline size={14} />, label: "Underline" },
	{ id: "link", icon: <Link size={14} />, label: "Link" },
];

export const Default: Story = {
	render: function DefaultStory() {
		return (
			<div className="relative h-64 rounded-xl bg-base-200 p-8">
				<p className="mb-6 text-base-content/60 text-sm">
					The toolbar anchors at a fixed position relative to the document.
				</p>
				<BubbleToolbar actions={textActions} anchor={{ x: 80, y: 120 }} open />
			</div>
		);
	},
};

export const WithActiveAction: Story = {
	render: function ActiveStory() {
		const [active, setActive] = useState<string | null>("bold");
		const actions = textActions.map((a) => ({
			...a,
			active: a.id === active,
			onSelect: () => setActive((prev) => (prev === a.id ? null : a.id)),
		}));
		return (
			<div className="relative h-64 rounded-xl bg-base-200 p-8">
				<p className="mb-6 text-base-content/60 text-sm">
					Click any button to toggle the active state.
				</p>
				<BubbleToolbar actions={actions} anchor={{ x: 80, y: 120 }} open />
			</div>
		);
	},
};

export const AlignmentActions: Story = {
	render: function AlignStory() {
		const [active, setActive] = useState("left");
		const actions = [
			{ id: "left", icon: <AlignLeft size={14} />, label: "Align left" },
			{ id: "center", icon: <AlignCenter size={14} />, label: "Align center" },
		].map((a) => ({
			...a,
			active: a.id === active,
			onSelect: () => setActive(a.id),
		}));
		return (
			<div className="relative h-64 rounded-xl bg-base-200 p-8">
				<BubbleToolbar actions={actions} anchor={{ x: 80, y: 120 }} open />
			</div>
		);
	},
};

export const Closed: Story = {
	render: function ClosedStory() {
		return (
			<div className="rounded-xl bg-base-200 p-8">
				<p className="text-base-content/60 text-sm">
					Toolbar is closed — nothing rendered.
				</p>
				<BubbleToolbar
					actions={textActions}
					anchor={{ x: 80, y: 120 }}
					open={false}
				/>
			</div>
		);
	},
};

export const ToggleOpen: Story = {
	render: function ToggleStory() {
		const [open, setOpen] = useState(false);
		return (
			<div className="relative h-64 rounded-xl bg-base-200 p-8">
				<button
					className="btn btn-sm btn-primary"
					onClick={() => setOpen((v) => !v)}
					type="button"
				>
					{open ? "Hide toolbar" : "Show toolbar"}
				</button>
				<BubbleToolbar
					actions={textActions}
					anchor={{ x: 80, y: 140 }}
					open={open}
				/>
			</div>
		);
	},
};
