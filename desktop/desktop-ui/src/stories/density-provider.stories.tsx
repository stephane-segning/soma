import type { Meta, StoryObj } from "@storybook/react";
import {
	DensityProvider,
	useDensity,
	useDensityValue,
} from "../components/primitives/density-provider";

const meta = {
	title: "Primitives/DensityProvider",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function DensityAwareRow({ label }: { label: string }) {
	const density = useDensity();
	const padding = useDensityValue({
		dense: "py-1 px-2",
		cozy: "py-2 px-3",
		oversized: "py-4 px-4",
	});
	const textSize = useDensityValue({
		dense: "text-xs",
		cozy: "text-sm",
		oversized: "text-base",
	});
	return (
		<div
			className={`flex items-center justify-between rounded border border-base-300 bg-base-100 ${padding}`}
		>
			<span className={textSize}>{label}</span>
			<span className="badge badge-sm badge-outline">{density}</span>
		</div>
	);
}

export const Dense: Story = {
	render: () => (
		<DensityProvider density="dense">
			<div className="max-w-sm space-y-1">
				<DensityAwareRow label="Row A" />
				<DensityAwareRow label="Row B" />
				<DensityAwareRow label="Row C" />
			</div>
		</DensityProvider>
	),
};

export const Cozy: Story = {
	render: () => (
		<DensityProvider density="cozy">
			<div className="max-w-sm space-y-1">
				<DensityAwareRow label="Row A" />
				<DensityAwareRow label="Row B" />
				<DensityAwareRow label="Row C" />
			</div>
		</DensityProvider>
	),
};

export const Oversized: Story = {
	render: () => (
		<DensityProvider density="oversized">
			<div className="max-w-sm space-y-1">
				<DensityAwareRow label="Row A" />
				<DensityAwareRow label="Row B" />
				<DensityAwareRow label="Row C" />
			</div>
		</DensityProvider>
	),
};

export const Comparison: Story = {
	render: () => (
		<div className="flex gap-8">
			{(["dense", "cozy", "oversized"] as const).map((density) => (
				<DensityProvider density={density} key={density}>
					<div className="min-w-40 space-y-1">
						<p className="mb-2 font-semibold text-xs uppercase text-base-content/50">
							{density}
						</p>
						<DensityAwareRow label="Row A" />
						<DensityAwareRow label="Row B" />
						<DensityAwareRow label="Row C" />
					</div>
				</DensityProvider>
			))}
		</div>
	),
};
