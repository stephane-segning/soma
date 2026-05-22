import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Bell, FileText, MessageSquare, Settings } from "react-feather";
import { Taskbar } from "../components/layout/taskbar";
import type { RunningApp } from "../types";

const meta: Meta<typeof Taskbar> = {
	title: "Layout/Taskbar",
	component: Taskbar,
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Taskbar>;

const APPS: RunningApp[] = [
	{
		id: "soma",
		title: "Soma",
		icon: <FileText size={14} />,
		status: "running",
	},
	{
		id: "chat",
		title: "Chat",
		icon: <MessageSquare size={14} />,
		status: "running",
		badge: "3",
	},
	{
		id: "settings",
		title: "Settings",
		icon: <Settings size={14} />,
		status: "sleeping",
	},
];

export const Default: Story = {
	render: function DefaultStory() {
		const [activeApp, setActiveApp] = useState("soma");
		return (
			<div className="h-screen bg-base-200 p-4">
				<Taskbar
					activeAppId={activeApp}
					apps={APPS}
					onSelectApp={setActiveApp}
				/>
			</div>
		);
	},
};

export const WithTray: Story = {
	render: function TrayStory() {
		const [activeApp, setActiveApp] = useState("soma");
		return (
			<div className="h-screen bg-base-200 p-4">
				<Taskbar
					activeAppId={activeApp}
					apps={APPS}
					onSelectApp={setActiveApp}
					tray={
						<button className="btn btn-ghost btn-xs" type="button">
							<Bell size={14} />
						</button>
					}
				/>
			</div>
		);
	},
};

export const WithStartOpen: Story = {
	render: function StartStory() {
		const [startOpen, setStartOpen] = useState(true);
		const [activeApp, setActiveApp] = useState("soma");
		return (
			<div className="h-screen bg-base-200 p-4">
				<Taskbar
					activeAppId={activeApp}
					apps={APPS}
					onSelectApp={setActiveApp}
					onStart={() => setStartOpen((v) => !v)}
					startOpen={startOpen}
				/>
			</div>
		);
	},
};

export const WithClosableApps: Story = {
	render: function ClosableStory() {
		const [apps, setApps] = useState<RunningApp[]>(
			APPS.map((a) => ({
				...a,
				onClose: () => setApps((prev) => prev.filter((p) => p.id !== a.id)),
			})),
		);
		const [activeApp, setActiveApp] = useState("soma");
		return (
			<div className="h-screen bg-base-200 p-4">
				<p className="mb-4 text-base-content/60 text-sm">
					Each app has a close button.
				</p>
				<Taskbar
					activeAppId={activeApp}
					apps={apps}
					onSelectApp={setActiveApp}
				/>
			</div>
		);
	},
};

export const NoApps: Story = {
	render: () => (
		<div className="h-screen bg-base-200 p-4">
			<Taskbar apps={[]} />
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: function DarkStory() {
		const [activeApp, setActiveApp] = useState("chat");
		return (
			<div className="h-screen bg-base-200 p-4">
				<Taskbar
					activeAppId={activeApp}
					apps={APPS}
					onSelectApp={setActiveApp}
				/>
			</div>
		);
	},
};
