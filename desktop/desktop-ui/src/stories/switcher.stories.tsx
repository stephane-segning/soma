import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Plus, Sun, Users } from "react-feather";
import { Switcher, type SwitcherItem } from "../components/forms/switcher";
import { Pill } from "../components/primitives/pill";

/**
 * The generic primitive that backs `BackendSwitcher`. These stories
 * focus on its reusability for non-backend pickers (themes, workspaces,
 * etc.). For the canonical "model picker in the composer" look, see
 * `Chat/BackendSwitcher`.
 */
const meta: Meta<typeof Switcher> = {
	title: "Forms/Switcher",
	component: Switcher,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Switcher>;

const BACKEND_ITEMS: SwitcherItem[] = [
	{
		id: "ollama-llama",
		label: "Ollama · llama3.3",
		mark: <span className="text-base-content/70">●</span>,
		subtitle: "ws://localhost:11434",
		trailing: <Pill tone="info">Default</Pill>,
	},
	{
		id: "openrouter-llama",
		label: "OpenRouter · llama3.3",
		mark: <span className="text-base-content/70">◆</span>,
		subtitle: "https://openrouter.ai/api/v1",
	},
	{
		id: "gpt-4o",
		label: "OpenAI · GPT-4o",
		mark: <span className="text-base-content/70">◇</span>,
		subtitle: "https://api.openai.com/v1",
	},
];

export const Default: Story = {
	render: function DefaultStory() {
		const [active, setActive] = useState<string | null>("ollama-llama");
		return (
			<div className="flex h-72 items-end p-4">
				<Switcher
					activeId={active}
					emptyLabel="No backend"
					footer={{
						icon: <Plus aria-hidden className="size-3.5" />,
						label: "Add backend…",
						onSelect: () => alert("deep-link to settings"),
					}}
					items={BACKEND_ITEMS}
					onChange={setActive}
					triggerAriaLabel="Switch backend"
				/>
			</div>
		);
	},
};

export const ThemePicker: Story = {
	render: function ThemeStory() {
		const items: SwitcherItem[] = [
			{ id: "cmyk", label: "Soma Light", mark: <Sun className="size-3.5" /> },
			{ id: "luxury", label: "Luxury (dark)", mark: <Sun className="size-3.5" /> },
			{ id: "system", label: "Follow system", mark: <Sun className="size-3.5" /> },
		];
		const [active, setActive] = useState<string | null>("cmyk");
		return (
			<div className="flex h-72 items-end p-4">
				<Switcher
					activeId={active}
					items={items}
					onChange={setActive}
					panelWidth="w-56"
					triggerAriaLabel="Switch theme"
				/>
			</div>
		);
	},
};

export const WorkspacePicker: Story = {
	render: function WorkspaceStory() {
		const items: SwitcherItem[] = [
			{
				id: "personal",
				label: "Personal",
				mark: <Users className="size-3.5" />,
				subtitle: "Just you",
			},
			{
				id: "engineering",
				label: "Engineering",
				mark: <Users className="size-3.5" />,
				subtitle: "12 members",
				trailing: <Pill tone="success">Active</Pill>,
			},
			{
				id: "design",
				label: "Design",
				mark: <Users className="size-3.5" />,
				subtitle: "5 members",
			},
		];
		const [active, setActive] = useState<string | null>("engineering");
		return (
			<div className="flex h-72 items-end p-4">
				<Switcher
					activeId={active}
					footer={{
						icon: <Plus aria-hidden className="size-3.5" />,
						label: "New workspace…",
						onSelect: () => {},
					}}
					items={items}
					onChange={setActive}
					triggerAriaLabel="Switch workspace"
				/>
			</div>
		);
	},
};

export const NoFooter: Story = {
	render: function NoFooterStory() {
		const items: SwitcherItem[] = [
			{ id: "a", label: "Option A" },
			{ id: "b", label: "Option B" },
			{ id: "c", label: "Option C" },
		];
		const [active, setActive] = useState<string | null>("a");
		return (
			<div className="flex h-72 items-end p-4">
				<Switcher
					activeId={active}
					items={items}
					onChange={setActive}
					panelWidth="w-48"
					triggerAriaLabel="Pick option"
				/>
			</div>
		);
	},
};

export const Empty: Story = {
	render: function EmptyStory() {
		return (
			<div className="flex h-72 items-end p-4">
				<Switcher
					activeId={null}
					emptyLabel="No option"
					footer={{
						icon: <Plus aria-hidden className="size-3.5" />,
						label: "Add option…",
						onSelect: () => {},
					}}
					items={[]}
					onChange={() => {}}
					triggerAriaLabel="Pick option"
				/>
			</div>
		);
	},
};

export const Disabled: Story = {
	render: () => (
		<div className="flex h-72 items-end p-4">
			<Switcher
				activeId="ollama-llama"
				disabled
				items={BACKEND_ITEMS}
				onChange={() => {}}
				triggerAriaLabel="Switch backend"
			/>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: function DarkStory() {
		const [active, setActive] = useState<string | null>("ollama-llama");
		return (
			<div className="flex h-72 items-end p-4">
				<Switcher
					activeId={active}
					footer={{
						icon: <Plus aria-hidden className="size-3.5" />,
						label: "Add backend…",
						onSelect: () => {},
					}}
					items={BACKEND_ITEMS}
					onChange={setActive}
					triggerAriaLabel="Switch backend"
				/>
			</div>
		);
	},
};
