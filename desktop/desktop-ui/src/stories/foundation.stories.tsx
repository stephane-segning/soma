import type { Meta, StoryObj } from "@storybook/react";
import {
	DensityProvider,
	type Density as DensityTier,
	useDensity,
} from "../components/primitives/density-provider";
import { useT } from "../i18n/use-t";

const meta = {
	title: "Foundation/Tokens & Providers",
	parameters: {
		layout: "padded",
	},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// -----------------------------------------------------------------
// Density tokens — visible inventory of the locked rem-based scale.

function DensitySample({ density }: { density: DensityTier }) {
	return (
		<DensityProvider density={density}>
			<DensityRow />
		</DensityProvider>
	);
}

function DensityRow() {
	const density = useDensity();
	return (
		<div className="flex items-center gap-3 rounded-md border border-base-300 bg-base-100 px-3 py-2">
			<span className="text-base-content/60 text-xs">density</span>
			<code className="text-sm">{density}</code>
			<span className="text-sm">Body 14px / 0.875rem · 1.5 line-height</span>
		</div>
	);
}

export const Density: Story = {
	render: () => (
		<div className="space-y-3">
			<DensitySample density="dense" />
			<DensitySample density="cozy" />
			<DensitySample density="oversized" />
		</div>
	),
};

// -----------------------------------------------------------------
// Row-height tiers — the locked content-named tiers.

export const RowTiers: Story = {
	render: () => (
		<div className="space-y-2 text-sm">
			<div className="row-text flex items-center gap-3 rounded-md border border-base-300 bg-base-100 px-3">
				<code>row-text</code>
				<span>2rem / 32px — text-only / icon-leading rows</span>
			</div>
			<div className="row-avatar flex items-center gap-3 rounded-md border border-base-300 bg-base-100 px-3">
				<span aria-hidden className="size-6 rounded-full bg-primary/30" />
				<code>row-avatar</code>
				<span>2.5rem / 40px — avatar / file-type glyph rows</span>
			</div>
			<div className="row-card flex items-center gap-3 rounded-md border border-base-300 bg-base-100 px-3">
				<span aria-hidden className="size-8 rounded-md bg-secondary/30" />
				<div className="flex flex-col">
					<code>row-card</code>
					<span className="text-base-content/60">
						3.25rem / 52px — two-line content
					</span>
				</div>
			</div>
		</div>
	),
};

// -----------------------------------------------------------------
// Surface utilities — visual regression smoke test for the token sweep.
// Shadows are off by default; floating overlays opt into `shadow-elevated`.

export const Surfaces: Story = {
	render: () => (
		<div className="grid grid-cols-2 gap-4">
			<div className="surface-card p-4">
				<div className="font-semibold text-sm">surface-card</div>
				<p className="text-base-content/70 text-sm">
					Border-only resting surface. No shadow.
				</p>
			</div>
			<div className="glass-panel p-4">
				<div className="font-semibold text-sm">glass-panel</div>
				<p className="text-base-content/70 text-sm">
					Translucent + blur. No shadow by default.
				</p>
			</div>
			<div className="glass-panel shadow-elevated p-4">
				<div className="font-semibold text-sm">
					glass-panel + shadow-elevated
				</div>
				<p className="text-base-content/70 text-sm">
					Floating-overlay opt-in. Use only on modal / popover /
					context-menu / toast.
				</p>
			</div>
			<div className="surface-card-legacy p-4">
				<div className="font-semibold text-sm">surface-card-legacy</div>
				<p className="text-base-content/70 text-sm">
					Pre-revamp depth. Reachable during cutover; deleted after.
				</p>
			</div>
			<div className="glass-panel-legacy rounded-2xl p-4">
				<div className="font-semibold text-sm">glass-panel-legacy</div>
				<p className="text-base-content/70 text-sm">
					Pre-revamp heavy shadow + radius. Same fate.
				</p>
			</div>
		</div>
	),
};

// -----------------------------------------------------------------
// i18n harness — minimal demonstration that `useT()` resolves an
// inline `defaultMessage` (the v0 source of truth).

function I18nDemo() {
	const t = useT();
	return (
		<p className="text-sm">
			{t({
				id: "foundation.demo.greeting",
				defaultMessage:
					"Hello, {name}! You have {count, plural, one {# new bot} other {# new bots}}.",
				values: { name: "Stéphane", count: 3 },
			})}
		</p>
	);
}

export const Internationalization: Story = {
	render: () => <I18nDemo />,
};
