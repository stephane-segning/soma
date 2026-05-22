import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Code, FileText, Settings, Terminal } from "react-feather";
import { type AppTab, AppTabs } from "../components/layout/app-tabs";

const meta: Meta<typeof AppTabs> = {
	title: "Layout/AppTabs",
	component: AppTabs,
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AppTabs>;

const SAMPLE_TABS: AppTab[] = [
	{
		id: "doc-1",
		title: "Architecture overview",
		icon: <FileText className="size-3.5" />,
	},
	{
		id: "doc-2",
		title: "Runbooks",
		icon: <FileText className="size-3.5" />,
		dirty: true,
	},
	{
		id: "doc-3",
		title: "Wave 3 / PR notes",
		icon: <FileText className="size-3.5" />,
	},
];

function MockSurface({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex h-screen flex-col bg-base-200">
			{children}
			<div className="flex flex-1 items-center justify-center text-base-content/40 text-sm">
				Mock editor canvas
			</div>
		</div>
	);
}

export const Default: Story = {
	render: function DefaultStory() {
		const [active, setActive] = useState("doc-1");
		return (
			<MockSurface>
				<AppTabs activeId={active} onSelect={setActive} tabs={SAMPLE_TABS} />
			</MockSurface>
		);
	},
};

export const Draggable: Story = {
	render: function DraggableStory() {
		const [tabs, setTabs] = useState<AppTab[]>(SAMPLE_TABS);
		const [active, setActive] = useState("doc-1");
		return (
			<MockSurface>
				<AppTabs
					activeId={active}
					onClose={(id) => {
						setTabs((prev) => prev.filter((t) => t.id !== id));
						if (id === active && tabs.length > 1) {
							const remaining = tabs.filter((t) => t.id !== id);
							setActive(remaining[0]?.id ?? "");
						}
					}}
					onReorder={(nextIds) => {
						setTabs((prev) => {
							const byId = new Map(prev.map((t) => [t.id, t]));
							return nextIds
								.map((id) => byId.get(id))
								.filter((t): t is AppTab => t !== undefined);
						});
					}}
					onSelect={setActive}
					tabs={tabs}
				/>
				<div className="px-4 py-2 text-base-content/50 text-xs">
					Drag a tab left or right to reorder. A quick click still selects.
				</div>
			</MockSurface>
		);
	},
};

export const WithCloseAndNew: Story = {
	render: function CloseStory() {
		const [tabs, setTabs] = useState<AppTab[]>(SAMPLE_TABS);
		const [active, setActive] = useState("doc-1");
		let nextId = 4;

		return (
			<MockSurface>
				<AppTabs
					activeId={active}
					onClose={(id) => {
						setTabs((prev) => prev.filter((t) => t.id !== id));
						if (id === active && tabs.length > 1) {
							const remaining = tabs.filter((t) => t.id !== id);
							setActive(remaining[0]?.id ?? "");
						}
					}}
					onNew={() => {
						const id = `doc-${nextId++}`;
						setTabs((prev) => [
							...prev,
							{
								id,
								title: `Untitled ${nextId - 1}`,
								icon: <FileText className="size-3.5" />,
							},
						]);
						setActive(id);
					}}
					onSelect={setActive}
					tabs={tabs}
				/>
			</MockSurface>
		);
	},
};

export const WithDirtyIndicators: Story = {
	render: function DirtyStory() {
		const tabs: AppTab[] = [
			{ id: "a", title: "Clean", icon: <FileText className="size-3.5" /> },
			{
				id: "b",
				title: "Has changes",
				icon: <FileText className="size-3.5" />,
				dirty: true,
			},
			{
				id: "c",
				title: "Also dirty",
				icon: <Code className="size-3.5" />,
				dirty: true,
			},
		];
		const [active, setActive] = useState("b");
		return (
			<MockSurface>
				<AppTabs activeId={active} onSelect={setActive} tabs={tabs} />
			</MockSurface>
		);
	},
};

export const MixedIcons: Story = {
	render: function IconsStory() {
		const tabs: AppTab[] = [
			{ id: "a", title: "README.md", icon: <FileText className="size-3.5" /> },
			{ id: "b", title: "schema.ts", icon: <Code className="size-3.5" /> },
			{ id: "c", title: "Terminal", icon: <Terminal className="size-3.5" /> },
			{ id: "d", title: "Settings", icon: <Settings className="size-3.5" /> },
		];
		const [active, setActive] = useState("b");
		return (
			<MockSurface>
				<AppTabs activeId={active} onSelect={setActive} tabs={tabs} />
			</MockSurface>
		);
	},
};

export const ManyTabs: Story = {
	render: function ManyStory() {
		const tabs: AppTab[] = Array.from({ length: 14 }, (_, i) => ({
			id: `t-${i}`,
			title: `Document ${i + 1}`,
			icon: <FileText className="size-3.5" />,
			dirty: i % 4 === 0,
		}));
		const [active, setActive] = useState("t-3");
		return (
			<MockSurface>
				<AppTabs activeId={active} onSelect={setActive} tabs={tabs} />
			</MockSurface>
		);
	},
};

export const Empty: Story = {
	render: function EmptyStory() {
		const [tabs, setTabs] = useState<AppTab[]>([]);
		let next = 1;
		return (
			<MockSurface>
				<AppTabs
					onNew={() => {
						const id = `t-${next++}`;
						setTabs((prev) => [
							...prev,
							{
								id,
								title: `Untitled ${next - 1}`,
								icon: <FileText className="size-3.5" />,
							},
						]);
					}}
					onSelect={() => {}}
					tabs={tabs}
				/>
			</MockSurface>
		);
	},
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: function DarkStory() {
		const [active, setActive] = useState("doc-1");
		return (
			<MockSurface>
				<AppTabs
					activeId={active}
					onClose={() => {}}
					onNew={() => {}}
					onSelect={setActive}
					tabs={SAMPLE_TABS}
				/>
			</MockSurface>
		);
	},
};
