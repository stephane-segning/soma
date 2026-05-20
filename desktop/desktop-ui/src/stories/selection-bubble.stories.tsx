import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { SelectionBubble } from "../components/editor/selection-bubble";

const meta = {
	title: "Editor/SelectionBubble",
	parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BLOCK_STYLES = [
	{ id: "p", label: "Body" },
	{ id: "h1", label: "Heading 1" },
	{ id: "h2", label: "Heading 2" },
	{ id: "h3", label: "Heading 3" },
	{ id: "code", label: "Code" },
];

function Demo() {
	const [bold, setBold] = useState(true);
	const [italic, setItalic] = useState(false);
	const [underline, setUnderline] = useState(false);
	const [strike, setStrike] = useState(false);
	const [code, setCode] = useState(false);
	const [highlight, setHighlight] = useState(false);
	const [linkUrl, setLinkUrl] = useState<string | null>(null);
	const [blockStyle, setBlockStyle] = useState(BLOCK_STYLES[0]);

	return (
		<div className="flex flex-col items-center gap-6">
			<SelectionBubble
				blockStyle={blockStyle}
				blockStyleOptions={BLOCK_STYLES}
				bold={bold}
				code={code}
				highlight={highlight}
				italic={italic}
				linkUrl={linkUrl}
				onAskAI={() => alert("Would open SelectionAIBar")}
				onChangeBlockStyle={(id) => {
					const next = BLOCK_STYLES.find((s) => s.id === id);
					if (next) setBlockStyle(next);
				}}
				onComment={() => alert("Would attach comment")}
				onMore={() => alert("More options")}
				onSetLink={setLinkUrl}
				onToggleBold={() => setBold((v) => !v)}
				onToggleCode={() => setCode((v) => !v)}
				onToggleHighlight={() => setHighlight((v) => !v)}
				onToggleItalic={() => setItalic((v) => !v)}
				onToggleStrike={() => setStrike((v) => !v)}
				onToggleUnderline={() => setUnderline((v) => !v)}
				strike={strike}
				underline={underline}
			/>
			<div className="text-base-content/60 text-xs">
				Link URL: <code className="font-mono">{linkUrl ?? "—"}</code>
			</div>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const NoBlockStyle: Story = {
	render: () => (
		<SelectionBubble
			bold
			onAskAI={() => undefined}
			onToggleBold={() => undefined}
			onToggleCode={() => undefined}
			onToggleHighlight={() => undefined}
			onToggleItalic={() => undefined}
			onToggleStrike={() => undefined}
			onToggleUnderline={() => undefined}
		/>
	),
};

export const NoAIChip: Story = {
	render: () => (
		<SelectionBubble
			blockStyle={BLOCK_STYLES[0]}
			blockStyleOptions={BLOCK_STYLES}
			bold
			onToggleBold={() => undefined}
			onToggleCode={() => undefined}
			onToggleHighlight={() => undefined}
			onToggleItalic={() => undefined}
			onToggleStrike={() => undefined}
			onToggleUnderline={() => undefined}
		/>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-6">
			<Demo />
		</div>
	),
};
