import type { Meta, StoryObj } from "@storybook/react";
import { File, MoreHorizontal } from "react-feather";

import { DenseRow } from "../components/lists/dense-row";
import { Pill } from "../components/primitives/pill";

const meta = {
	title: "Lists/DenseRow",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const Avatar = ({ initials }: { initials: string }) => (
	<div className="grid size-7 place-items-center rounded-full bg-primary/15 font-medium text-primary text-xs">
		{initials}
	</div>
);

const Overflow = () => (
	<button
		aria-label="More options"
		className="grid size-7 place-items-center rounded-md text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
		type="button"
	>
		<MoreHorizontal aria-hidden className="size-4" />
	</button>
);

export const TextTier: Story = {
	render: () => (
		<ul className="list max-w-xl">
			<DenseRow actions={<Overflow />} primary="Project planning"  />
			<DenseRow actions={<Overflow />} primary="Onboarding"  />
			<DenseRow actions={<Overflow />} primary="Meeting notes"  />
		</ul>
	),
};

export const AvatarTier: Story = {
	render: () => (
		<ul className="list max-w-xl">
			<DenseRow
				actions={<Overflow />}
				leading={<Avatar initials="SS" />}
				primary="Stéphane"
				status={<Pill tone="info">Owner</Pill>}
				
			/>
			<DenseRow
				actions={<Overflow />}
				leading={<Avatar initials="NL" />}
				meta="last seen 2h"
				primary="Naomi"
				
			/>
			<DenseRow
				actions={<Overflow />}
				leading={<Avatar initials="JK" />}
				primary="Jack"
				status={<Pill tone="warning">Pending</Pill>}
				
			/>
		</ul>
	),
};

export const CardTier: Story = {
	render: () => (
		<ul className="list max-w-xl">
			<DenseRow
				actions={<Overflow />}
				leading={<File aria-hidden className="size-5 text-info" />}
				meta="14 KB"
				primary="space-design.md"
				sub="Updated yesterday · 2 references"
			/>
			<DenseRow
				actions={<Overflow />}
				leading={<File aria-hidden className="size-5 text-warning" />}
				meta="120 KB"
				primary="capability-form.png"
				sub="Image · png"
				status={<Pill tone="success">attached</Pill>}
			/>
		</ul>
	),
};

export const Clickable: Story = {
	render: () => (
		<ul className="list max-w-xl">
			<DenseRow
				actions={<Overflow />}
				leading={<Avatar initials="OL" />}
				onClick={() => undefined}
				primary="Ollama"
				status={<Pill tone="info">Default</Pill>}
			/>
			<DenseRow
				actions={<Overflow />}
				leading={<Avatar initials="LM" />}
				onClick={() => undefined}
				primary="LM Studio"
			/>
		</ul>
	),
};

export const StatusPills: Story = {
	render: () => (
		<ul className="list max-w-xl">
			<DenseRow
				leading={<Avatar initials="@F" />}
				meta="Last acked 2m"
				primary="@bot:fetch"
				status={
					<Pill dot="pulse" tone="neutral">
						Pending
					</Pill>
				}
			/>
			<DenseRow
				leading={<Avatar initials="@A" />}
				meta="Last acked just now"
				primary="@bot:archive"
				status={
					<Pill dot tone="success">
						Active
					</Pill>
				}
			/>
			<DenseRow
				leading={<Avatar initials="@K" />}
				meta="Failed 5m ago"
				primary="@bot:keeper"
				status={
					<Pill dot tone="error">
						Failed
					</Pill>
				}
			/>
		</ul>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<ul className="list max-w-xl bg-base-100">
			<DenseRow
				actions={<Overflow />}
				leading={<Avatar initials="SS" />}
				primary="Stéphane"
				status={<Pill tone="info">Owner</Pill>}
			/>
			<DenseRow
				actions={<Overflow />}
				leading={<File aria-hidden className="size-5 text-info" />}
				meta="14 KB"
				primary="space-design.md"
				sub="Updated yesterday · 2 references"
			/>
		</ul>
	),
};
