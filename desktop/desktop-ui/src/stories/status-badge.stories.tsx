import type { Meta, StoryObj } from "@storybook/react";
import { CheckCircle, Clock, WifiOff, Zap } from "react-feather";
import { StatusBadge } from "../components/presence/status-badge";

const meta: Meta<typeof StatusBadge> = {
	title: "Presence/StatusBadge",
	component: StatusBadge,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const AllTones: Story = {
	render: () => (
		<div className="flex flex-wrap gap-3">
			<StatusBadge label="Info" tone="info" />
			<StatusBadge label="Success" tone="success" />
			<StatusBadge label="Warning" tone="warning" />
			<StatusBadge label="Danger" tone="danger" />
			<StatusBadge label="Muted" tone="muted" />
		</div>
	),
};

export const WithIcons: Story = {
	render: () => (
		<div className="flex flex-wrap gap-3">
			<StatusBadge icon={<Zap size={10} />} label="Online" tone="success" />
			<StatusBadge icon={<Clock size={10} />} label="Syncing" tone="warning" />
			<StatusBadge icon={<WifiOff size={10} />} label="Offline" tone="danger" />
			<StatusBadge icon={<CheckCircle size={10} />} label="Ready" tone="info" />
		</div>
	),
};

export const StatusLabels: Story = {
	render: () => (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<StatusBadge icon={<Zap size={10} />} label="Running" tone="success" />
				<span className="text-base-content/60 text-sm">Bot is active</span>
			</div>
			<div className="flex items-center gap-3">
				<StatusBadge icon={<Clock size={10} />} label="Sleeping" tone="muted" />
				<span className="text-base-content/60 text-sm">Idle for 10m</span>
			</div>
			<div className="flex items-center gap-3">
				<StatusBadge
					icon={<CheckCircle size={10} />}
					label="Synced"
					tone="info"
				/>
				<span className="text-base-content/60 text-sm">All changes saved</span>
			</div>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="flex flex-wrap gap-3">
			<StatusBadge label="Info" tone="info" />
			<StatusBadge label="Success" tone="success" />
			<StatusBadge label="Warning" tone="warning" />
			<StatusBadge label="Danger" tone="danger" />
			<StatusBadge label="Muted" tone="muted" />
		</div>
	),
};
