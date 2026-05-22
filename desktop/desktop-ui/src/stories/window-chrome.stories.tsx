import type { Meta, StoryObj } from "@storybook/react";
import { Settings, Share2 } from "react-feather";
import { WindowChrome } from "../components/layout/window-chrome";

const meta: Meta<typeof WindowChrome> = {
	title: "Layout/WindowChrome",
	component: WindowChrome,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof WindowChrome>;

export const Online: Story = {
	render: () => (
		<div className="overflow-hidden rounded-lg shadow-lg">
			<WindowChrome
				onClose={() => {}}
				onMaximize={() => {}}
				onMinimize={() => {}}
				status="online"
				subtitle="Last saved 2m ago"
				title="Soma — Engineering"
			/>
			<div className="h-40 bg-base-100 p-4 text-base-content/60 text-sm">
				Editor content here
			</div>
		</div>
	),
};

export const Syncing: Story = {
	render: () => (
		<div className="overflow-hidden rounded-lg shadow-lg">
			<WindowChrome
				onClose={() => {}}
				onMaximize={() => {}}
				onMinimize={() => {}}
				status="syncing"
				subtitle="Syncing changes…"
				title="Soma — Engineering"
			/>
			<div className="h-40 bg-base-100 p-4 text-base-content/60 text-sm">
				Editor content here
			</div>
		</div>
	),
};

export const Offline: Story = {
	render: () => (
		<div className="overflow-hidden rounded-lg shadow-lg">
			<WindowChrome
				onClose={() => {}}
				onMaximize={() => {}}
				onMinimize={() => {}}
				status="offline"
				subtitle="No connection"
				title="Soma — Engineering"
			/>
			<div className="h-40 bg-base-100 p-4 text-base-content/60 text-sm">
				Editor content here
			</div>
		</div>
	),
};

export const AllStatuses: Story = {
	render: () => (
		<div className="space-y-4">
			{(["online", "syncing", "offline"] as const).map((status) => (
				<div className="overflow-hidden rounded-lg shadow" key={status}>
					<WindowChrome
						onClose={() => {}}
						status={status}
						subtitle={`Status: ${status}`}
						title="Soma"
					/>
				</div>
			))}
		</div>
	),
};

export const WithExtraActions: Story = {
	render: () => (
		<div className="overflow-hidden rounded-lg shadow-lg">
			<WindowChrome
				actions={
					<div className="flex items-center gap-1">
						<button
							aria-label="Share"
							className="btn btn-ghost btn-xs"
							type="button"
						>
							<Share2 size={12} />
						</button>
						<button
							aria-label="Settings"
							className="btn btn-ghost btn-xs"
							type="button"
						>
							<Settings size={12} />
						</button>
					</div>
				}
				onClose={() => {}}
				onMaximize={() => {}}
				onMinimize={() => {}}
				status="online"
				title="Soma — Engineering"
			/>
			<div className="h-40 bg-base-100 p-4 text-base-content/60 text-sm">
				Editor content here
			</div>
		</div>
	),
};

export const TitleOnly: Story = {
	render: () => (
		<div className="overflow-hidden rounded-lg shadow-lg">
			<WindowChrome
				onClose={() => {}}
				title="Untitled document"
			/>
			<div className="h-40 bg-base-100 p-4 text-base-content/60 text-sm">
				Editor content here
			</div>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="overflow-hidden rounded-lg shadow-lg">
			<WindowChrome
				onClose={() => {}}
				onMaximize={() => {}}
				onMinimize={() => {}}
				status="online"
				subtitle="Last saved 2m ago"
				title="Soma — Engineering"
			/>
			<div className="h-40 bg-base-100 p-4 text-base-content/60 text-sm">
				Editor content here
			</div>
		</div>
	),
};
