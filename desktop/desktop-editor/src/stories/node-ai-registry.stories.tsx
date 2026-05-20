import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";

import { createNodeAIRegistry } from "@soma/ui/components/editor/node-ai-registry";

import {
	getNodeAIStorage,
	NodeAIRegistryExtension,
} from "../extensions/node-ai-registry";

const meta = {
	title: "Editor/NodeAIRegistry (TipTap)",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
	const [log, setLog] = useState<string[]>([]);

	const registry = useMemo(() => {
		const r = createNodeAIRegistry();
		r.register("paragraph", {
			id: "improve",
			label: "Improve writing",
			category: "rewrite",
			surfaces: ["selection"],
			run: (ctx) =>
				setLog((prev) => [
					`improve / surface=${ctx.surface} / text="${ctx.text}"`,
					...prev,
				]),
		});
		r.register("paragraph", {
			id: "continue",
			label: "Continue writing",
			category: "modify",
			surfaces: ["caret"],
			run: (ctx) =>
				setLog((prev) => [
					`continue / surface=${ctx.surface} / blockText="${ctx.text}"`,
					...prev,
				]),
		});
		return r;
	}, []);

	const editor = useEditor({
		extensions: [
			Document,
			Paragraph,
			Text,
			NodeAIRegistryExtension.configure({ registry }),
		],
		content:
			"<p>The Soma platform is a local-first workspace where TipTap is the user's memory.</p>",
		// biome-ignore lint/correctness/useExhaustiveDependencies: TipTap one-shot setup
	}, []);

	const storage = editor ? getNodeAIStorage(editor) : null;
	const ctx = storage?.resolveContext() ?? null;
	const visibleActions = storage?.resolveActions() ?? [];

	return (
		<div className="flex max-w-3xl flex-col gap-3 text-sm">
			<div className="rounded-md border border-base-300 bg-base-100 p-3">
				<EditorContent editor={editor} />
			</div>
			<div className="rounded-md border border-base-300 p-3 text-sm">
				<div className="mb-1 text-base-content/60 text-xs uppercase">
					Resolved context
				</div>
				<pre className="m-0 whitespace-pre-wrap font-mono text-base-content/80 text-xs">
					{ctx
						? JSON.stringify(
								{
									surface: ctx.surface,
									nodeType: ctx.nodeType,
									text: ctx.text,
								},
								null,
								2,
							)
						: "(no editor)"}
				</pre>
			</div>
			<div className="rounded-md border border-base-300 p-3 text-sm">
				<div className="mb-1 text-base-content/60 text-xs uppercase">
					Actions for current surface
				</div>
				{visibleActions.length === 0 ? (
					<div className="text-base-content/60">
						None — change the selection (drag-select text vs. just click).
					</div>
				) : (
					<ul className="flex flex-col gap-1">
						{visibleActions.map((action) => (
							<li
								className="flex items-center justify-between gap-2"
								key={action.id}
							>
								<span>
									<span className="font-mono text-xs">
										{action.category}
									</span>
									{" · "}
									{action.label}
								</span>
								<button
									className="rounded-md bg-primary px-2 py-0.5 text-primary-content text-xs"
									onClick={() =>
										editor?.commands.dispatchAIAction(action.id)
									}
									type="button"
								>
									Dispatch
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="rounded-md border border-base-300 p-3 text-sm">
				<div className="mb-1 text-base-content/60 text-xs uppercase">
					Invocation log
				</div>
				{log.length === 0 ? (
					<div className="text-base-content/60">
						No actions dispatched yet.
					</div>
				) : (
					<ul className="flex flex-col gap-0.5 font-mono text-xs">
						{log.map((entry, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: append-only log
							<li key={idx}>{entry}</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

export const Resolution: Story = {
	render: () => <Demo />,
};
