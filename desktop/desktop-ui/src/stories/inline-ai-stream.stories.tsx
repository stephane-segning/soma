import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";

import { InlineAIStream } from "../components/editor/inline-ai-stream";

const meta = {
	title: "Editor/InlineAIStream",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FULL_TEXT =
	"Soma is a local-first workspace where TipTap is your memory and the assistant turns it into summaries, exercises, and plans on demand.";

function StreamDemo() {
	const [pending, setPending] = useState(true);
	const [text, setText] = useState("");
	const [streaming, setStreaming] = useState(false);

	useEffect(() => {
		const pendingTimer = setTimeout(() => {
			setPending(false);
			setStreaming(true);
		}, 1200);
		return () => clearTimeout(pendingTimer);
	}, []);

	useEffect(() => {
		if (pending || !streaming) return;
		if (text.length >= FULL_TEXT.length) {
			setStreaming(false);
			return;
		}
		const tick = setTimeout(() => {
			setText(FULL_TEXT.slice(0, text.length + 2));
		}, 28);
		return () => clearTimeout(tick);
	}, [pending, streaming, text]);

	function restart() {
		setPending(true);
		setText("");
		setStreaming(false);
		setTimeout(() => {
			setPending(false);
			setStreaming(true);
		}, 1200);
	}

	return (
		<div className="flex max-w-2xl flex-col gap-3 text-ui-sm">
			<div className="rounded-md border border-base-300 bg-base-100 p-3 text-body">
				<p className="text-base-content/90">
					Paragraph before the AI region.{" "}
					<InlineAIStream
						onStop={() => setStreaming(false)}
						pending={pending}
						streaming={streaming}
						text={text}
					/>{" "}
					Paragraph after.
				</p>
			</div>
			<div className="flex items-center gap-2 text-base-content/60 text-ui-xs">
				<button
					className="rounded-md border border-base-300 px-2 py-1 text-base-content/80"
					onClick={restart}
					type="button"
				>
					Restart
				</button>
				<span>
					pending: <code>{String(pending)}</code> · streaming:{" "}
					<code>{String(streaming)}</code>
				</span>
			</div>
		</div>
	);
}

export const Streaming: Story = {
	render: () => <StreamDemo />,
};

export const PendingOnly: Story = {
	render: () => (
		<div className="max-w-2xl text-base-content/90 text-body">
			<p>
				Paragraph before. <InlineAIStream pending text="" /> Paragraph after.
			</p>
		</div>
	),
};

export const Complete: Story = {
	render: () => (
		<div className="max-w-2xl text-base-content/90 text-body">
			<p>
				Paragraph before. <InlineAIStream streaming={false} text={FULL_TEXT} />{" "}
				Paragraph after.
			</p>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-4">
			<StreamDemo />
		</div>
	),
};
