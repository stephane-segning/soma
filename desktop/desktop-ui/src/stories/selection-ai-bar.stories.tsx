import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";

import { createNodeAIRegistry } from "../components/editor/node-ai-registry";
import { SelectionAIBar } from "../components/editor/selection-ai-bar";

const meta = {
	title: "Editor/SelectionAIBar",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_TEXT =
	"Our space sync model leans on libp2p for peer discovery and CIDs for blob content addressing.";

function Demo({ nodeType = "paragraph" }: { nodeType?: string }) {
	const [log, setLog] = useState<string[]>([]);

	const registry = useMemo(() => {
		const r = createNodeAIRegistry();
		// Paragraph actions
		r.register("paragraph", {
			id: "improve",
			label: "Improve writing",
			category: "rewrite",
			run: () => setLog((prev) => ["ran: improve", ...prev]),
		});
		r.register("paragraph", {
			id: "fix-grammar",
			label: "Fix grammar",
			category: "rewrite",
			run: () => setLog((prev) => ["ran: fix-grammar", ...prev]),
		});
		r.register("paragraph", {
			id: "shorter",
			label: "Make shorter",
			category: "modify",
			run: () => setLog((prev) => ["ran: shorter", ...prev]),
		});
		r.register("paragraph", {
			id: "expand",
			label: "Expand",
			category: "modify",
			run: () => setLog((prev) => ["ran: expand", ...prev]),
		});
		r.register("paragraph", {
			id: "summarize",
			label: "Summarize",
			category: "modify",
			run: () => setLog((prev) => ["ran: summarize", ...prev]),
		});
		r.register("paragraph", {
			id: "professional",
			label: "Professional",
			category: "tone",
			run: () => setLog((prev) => ["ran: professional", ...prev]),
		});
		r.register("paragraph", {
			id: "casual",
			label: "Casual",
			category: "tone",
			run: () => setLog((prev) => ["ran: casual", ...prev]),
		});
		r.register("paragraph", {
			id: "to-bullets",
			label: "Turn into bullet list",
			category: "transform",
			run: () => setLog((prev) => ["ran: to-bullets", ...prev]),
		});
		r.register("paragraph", {
			id: "translate-fr",
			label: "Translate to French",
			category: "translate",
			run: () => setLog((prev) => ["ran: translate-fr", ...prev]),
		});

		// Code-block actions
		r.register("code-block", {
			id: "explain",
			label: "Explain",
			category: "rewrite",
			run: () => setLog((prev) => ["ran: explain", ...prev]),
		});
		r.register("code-block", {
			id: "refactor",
			label: "Refactor",
			category: "modify",
			run: () => setLog((prev) => ["ran: refactor", ...prev]),
		});

		return r;
	}, []);

	return (
		<div className="flex max-w-3xl flex-col gap-3 text-sm">
			<SelectionAIBar
				nodeType={nodeType}
				onClose={() => setLog((prev) => ["closed", ...prev])}
				onCustomPrompt={(p) => setLog((prev) => [`custom: "${p}"`, ...prev])}
				registry={registry}
				selectedText={SAMPLE_TEXT}
			/>
			<div className="rounded-md border border-base-300 bg-base-100 p-3">
				<div className="mb-1 text-base-content/60 text-xs uppercase">
					Invocation log
				</div>
				{log.length === 0 ? (
					<div className="text-base-content/60">No actions invoked yet.</div>
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

export const Paragraph: Story = {
	render: () => <Demo nodeType="paragraph" />,
};

export const CodeBlock: Story = {
	render: () => <Demo nodeType="code-block" />,
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-4">
			<Demo nodeType="paragraph" />
		</div>
	),
};
