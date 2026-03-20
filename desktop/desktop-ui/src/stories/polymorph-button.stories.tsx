import type { Meta, StoryObj } from "@storybook/react";
import { Play, Shield, Trash2, Zap } from "react-feather";
import { PolymorphButton } from "../components/actions/polymorph-button";

const meta: Meta<typeof PolymorphButton> = {
	title: "Inputs/PolymorphButton",
	component: PolymorphButton,
	parameters: {
		layout: "padded",
	},
	args: {
		children: "Launch",
	},
};

export default meta;
type Story = StoryObj<typeof PolymorphButton>;

export const Variants: Story = {
	render: () => (
		<div className="flex flex-wrap gap-3">
			<PolymorphButton leadingIcon={<Zap size={14} />} variant="primary">
				Primary
			</PolymorphButton>
			<PolymorphButton leadingIcon={<Shield size={14} />} variant="secondary">
				Secondary
			</PolymorphButton>
			<PolymorphButton leadingIcon={<Play size={14} />} variant="outline">
				Outline
			</PolymorphButton>
			<PolymorphButton leadingIcon={<Trash2 size={14} />} variant="danger">
				Danger
			</PolymorphButton>
			<PolymorphButton variant="ghost">Ghost</PolymorphButton>
			<PolymorphButton variant="success">Success</PolymorphButton>
		</div>
	),
};

export const Sizes: Story = {
	render: () => (
		<div className="flex flex-wrap items-center gap-3">
			<PolymorphButton size="xs">Extra small</PolymorphButton>
			<PolymorphButton size="sm">Small</PolymorphButton>
			<PolymorphButton size="md">Medium</PolymorphButton>
			<PolymorphButton size="lg">Large</PolymorphButton>
		</div>
	),
};

export const IconOnly: Story = {
	render: () => (
		<div className="flex flex-wrap gap-3">
			<PolymorphButton
				aria-label="Zap"
				iconOnly
				leadingIcon={<Zap size={16} />}
				variant="primary"
			/>
			<PolymorphButton
				aria-label="Shield"
				iconOnly
				leadingIcon={<Shield size={16} />}
				variant="outline"
			/>
			<PolymorphButton
				aria-label="Delete"
				iconOnly
				leadingIcon={<Trash2 size={16} />}
				variant="danger"
			/>
		</div>
	),
};

export const Loading: Story = {
	args: {
		leadingIcon: <Play size={14} />,
		loading: true,
		children: "Loading state",
	},
};
