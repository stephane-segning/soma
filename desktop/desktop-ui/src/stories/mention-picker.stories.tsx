import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { File, User } from "react-feather";

import {
	MentionPicker,
	type MentionSection,
} from "../components/editor/mention-picker";

const meta = {
	title: "Editor/MentionPicker",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SECTIONS: MentionSection[] = [
	{
		kind: "bots",
		items: [
			{
				id: "fetcher",
				label: "fetcher",
				isBot: true,
				meta: "12D…Cd34",
			},
			{
				id: "archive",
				label: "archive",
				isBot: true,
				meta: "12D…Pe10",
			},
		],
	},
	{
		kind: "documents",
		items: [
			{
				id: "doc-1",
				label: "Project plan",
				icon: <File className="size-4" />,
				meta: "Personal",
			},
			{
				id: "doc-2",
				label: "Onboarding",
				icon: <File className="size-4" />,
				meta: "Team",
			},
		],
	},
	{
		kind: "members",
		items: [
			{
				id: "ss",
				label: "Stéphane",
				icon: <User className="size-4" />,
			},
			{
				id: "nl",
				label: "Naomi",
				icon: <User className="size-4" />,
			},
		],
	},
];

function Demo() {
	const [query, setQuery] = useState("");
	const [picked, setPicked] = useState<string | null>(null);

	return (
		<div className="flex max-w-xl flex-col gap-3 text-sm">
			<div className="rounded-md border border-base-300 bg-base-100 p-3">
				<label className="flex flex-col gap-1">
					<span className="text-base-content/60 text-xs">
						Filter (mock composer text after `@`)
					</span>
					<input
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1 text-sm outline-none focus-visible:border-primary"
						onChange={(event) => setQuery(event.target.value)}
						placeholder="type to filter…"
						value={query}
					/>
				</label>
			</div>
			<MentionPicker
				onClose={() => setPicked("(closed)")}
				onSelect={(item, section) =>
					setPicked(`${section} · ${item.label} (${item.id})`)
				}
				query={query}
				sections={SECTIONS}
			/>
			<div className="text-base-content/60 text-xs">
				Last action: <code className="font-mono">{picked ?? "—"}</code>
			</div>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const FilteredNoResults: Story = {
	render: () => (
		<MentionPicker
			onClose={() => undefined}
			onSelect={() => undefined}
			query="zzz"
			sections={SECTIONS}
		/>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-4">
			<Demo />
		</div>
	),
};
