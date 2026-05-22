import type { Meta, StoryObj } from "@storybook/react";
import { Kbd } from "../components/primitives/kbd";

const meta: Meta<typeof Kbd> = {
	title: "Primitives/Kbd",
	component: Kbd,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Kbd>;

export const SingleKeys: Story = {
	render: () => (
		<div className="flex flex-wrap items-center gap-3">
			<Kbd>⌘</Kbd>
			<Kbd>⇧</Kbd>
			<Kbd>⌥</Kbd>
			<Kbd>⌃</Kbd>
			<Kbd>Esc</Kbd>
			<Kbd>Tab</Kbd>
			<Kbd>Enter</Kbd>
			<Kbd>Backspace</Kbd>
		</div>
	),
};

export const Chords: Story = {
	render: () => (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<Kbd>⌘K</Kbd>
				<span className="text-base-content/60 text-sm">Command palette</span>
			</div>
			<div className="flex items-center gap-2">
				<Kbd>⌘⇧F</Kbd>
				<span className="text-base-content/60 text-sm">Global search</span>
			</div>
			<div className="flex items-center gap-2">
				<Kbd>Ctrl+Shift+Del</Kbd>
				<span className="text-base-content/60 text-sm">Hard delete (named keys)</span>
			</div>
			<div className="flex items-center gap-2">
				<Kbd>{["⌘", "K"]}</Kbd>
				<span className="text-base-content/60 text-sm">Explicit array form</span>
			</div>
		</div>
	),
};

export const Sizes: Story = {
	render: () => (
		<div className="flex flex-wrap items-end gap-4">
			<div className="flex flex-col items-center gap-1">
				<Kbd size="xs">⌘K</Kbd>
				<span className="text-base-content/50 text-xs">xs</span>
			</div>
			<div className="flex flex-col items-center gap-1">
				<Kbd size="sm">⌘K</Kbd>
				<span className="text-base-content/50 text-xs">sm</span>
			</div>
			<div className="flex flex-col items-center gap-1">
				<Kbd size="md">⌘K</Kbd>
				<span className="text-base-content/50 text-xs">md</span>
			</div>
			<div className="flex flex-col items-center gap-1">
				<Kbd size="lg">⌘K</Kbd>
				<span className="text-base-content/50 text-xs">lg</span>
			</div>
			<div className="flex flex-col items-center gap-1">
				<Kbd size="xl">⌘K</Kbd>
				<span className="text-base-content/50 text-xs">xl</span>
			</div>
		</div>
	),
};

export const InlineUsage: Story = {
	render: () => (
		<div className="space-y-3 text-sm">
			<p>
				Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to open the command palette, or use{" "}
				<Kbd size="xs">⌘⇧P</Kbd> for settings.
			</p>
			<p>
				Hold <Kbd>⌥</Kbd> and click to select a word; press{" "}
				<Kbd size="xs">Esc</Kbd> to cancel.
			</p>
		</div>
	),
};

export const NamedKeys: Story = {
	render: () => (
		<div className="flex flex-wrap items-center gap-3">
			{(
				[
					"Esc", "Enter", "Tab", "Backspace", "Delete",
					"Home", "End", "PageUp", "PageDown",
					"F1", "F5", "F12",
				] as const
			).map((key) => (
				<Kbd key={key}>{key}</Kbd>
			))}
		</div>
	),
};
