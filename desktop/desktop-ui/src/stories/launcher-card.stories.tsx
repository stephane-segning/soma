import type { Meta, StoryObj } from "@storybook/react";
import { BookOpen, Code, FileText, MessageCircle, Zap } from "react-feather";
import { LauncherCard } from "../components/cards/launcher-card";

const meta: Meta<typeof LauncherCard> = {
	title: "Cards/LauncherCard",
	component: LauncherCard,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof LauncherCard>;

export const Default: Story = {
	render: () => (
		<div className="max-w-sm">
			<LauncherCard
				description="Start a new conversation with the AI assistant."
				icon={<MessageCircle size={20} />}
				onClick={() => {}}
				title="New conversation"
			/>
		</div>
	),
};

export const WithBadge: Story = {
	render: () => (
		<div className="max-w-sm">
			<LauncherCard
				badge="New"
				description="Create and run code directly in your workspace."
				icon={<Code size={20} />}
				onClick={() => {}}
				title="Code runner"
			/>
		</div>
	),
};

export const WithActions: Story = {
	render: () => (
		<div className="max-w-sm">
			<LauncherCard
				actions={
					<>
						<button className="badge badge-sm badge-outline" type="button">
							Quick start
						</button>
						<button className="badge badge-sm badge-outline" type="button">
							Browse templates
						</button>
					</>
				}
				description="Browse and open documents in your space."
				icon={<FileText size={20} />}
				onClick={() => {}}
				title="Documents"
			/>
		</div>
	),
};

export const Grid: Story = {
	render: () => (
		<div className="grid max-w-2xl grid-cols-2 gap-3">
			<LauncherCard
				description="Chat with your AI assistant."
				icon={<MessageCircle size={20} />}
				onClick={() => {}}
				title="Chat"
			/>
			<LauncherCard
				badge="Beta"
				description="Run and debug code inline."
				icon={<Code size={20} />}
				onClick={() => {}}
				title="Code runner"
			/>
			<LauncherCard
				description="Open and edit documents."
				icon={<FileText size={20} />}
				onClick={() => {}}
				title="Documents"
			/>
			<LauncherCard
				description="Read the onboarding guide."
				icon={<BookOpen size={20} />}
				onClick={() => {}}
				title="Get started"
			/>
		</div>
	),
};

export const NoDescription: Story = {
	render: () => (
		<div className="max-w-sm">
			<LauncherCard
				icon={<Zap size={20} />}
				onClick={() => {}}
				title="Quick action"
			/>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="max-w-sm">
			<LauncherCard
				badge="New"
				description="Start a new conversation with the AI assistant."
				icon={<MessageCircle size={20} />}
				onClick={() => {}}
				title="New conversation"
			/>
		</div>
	),
};
