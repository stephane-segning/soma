import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";

import { createNodeAIRegistry } from "../components/editor/node-ai-registry";
import type { NodeAIActionSurface } from "../components/editor/node-ai-registry.types";

const meta = {
	title: "Editor/NodeAIRegistry",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SURFACES: NodeAIActionSurface[] = ["selection", "caret", "node"];

function Demo() {
	const [nodeType, setNodeType] = useState("paragraph");
	const [surface, setSurface] = useState<NodeAIActionSurface>("selection");
	const [log, setLog] = useState<string[]>([]);

	const registry = useMemo(() => {
		const r = createNodeAIRegistry();

		// Paragraph actions.
		r.register("paragraph", {
			id: "improve",
			label: "Improve writing",
			category: "rewrite",
			surfaces: ["selection"],
			run: () => setLog((prev) => ["improve fired", ...prev]),
		});
		r.register("paragraph", {
			id: "shorter",
			label: "Make shorter",
			category: "modify",
			surfaces: ["selection"],
			run: () => setLog((prev) => ["shorter fired", ...prev]),
		});
		r.register("paragraph", {
			id: "continue",
			label: "Continue writing",
			category: "modify",
			surfaces: ["caret"],
			run: () => setLog((prev) => ["continue fired", ...prev]),
		});

		// Image actions — node surface only.
		r.register("image", {
			id: "alt",
			label: "Generate alt text",
			category: "node",
			surfaces: ["node"],
			run: () => setLog((prev) => ["alt fired", ...prev]),
		});
		r.register("image", {
			id: "caption",
			label: "Caption",
			category: "node",
			surfaces: ["node"],
			run: () => setLog((prev) => ["caption fired", ...prev]),
		});

		// Code-block actions.
		r.register("code-block", {
			id: "explain",
			label: "Explain",
			category: "node",
			surfaces: ["node"],
			run: () => setLog((prev) => ["explain fired", ...prev]),
		});

		return r;
	}, []);

	const actions = registry.resolve(nodeType, surface);

	return (
		<div className="flex max-w-2xl flex-col gap-4 text-sm">
			<div className="flex gap-3 text-sm">
				<label className="flex items-center gap-2">
					<span className="text-base-content/60">Node:</span>
					<select
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1"
						onChange={(event) => setNodeType(event.target.value)}
						value={nodeType}
					>
						<option value="paragraph">paragraph</option>
						<option value="image">image</option>
						<option value="code-block">code-block</option>
					</select>
				</label>
				<label className="flex items-center gap-2">
					<span className="text-base-content/60">Surface:</span>
					<select
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1"
						onChange={(event) =>
							setSurface(event.target.value as NodeAIActionSurface)
						}
						value={surface}
					>
						{SURFACES.map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
				</label>
			</div>

			<div className="rounded-md border border-base-300 p-3">
				<div className="mb-2 text-base-content/60 text-xs uppercase">
					Resolved actions
				</div>
				{actions.length === 0 ? (
					<div className="text-base-content/60">No actions for this combo.</div>
				) : (
					<ul className="flex flex-col gap-1">
						{actions.map((action) => (
							<li className="flex items-center justify-between" key={action.id}>
								<span>
									<span className="font-mono text-xs text-base-content/60">
										{action.category}
									</span>
									{" · "}
									{action.label}
								</span>
								<button
									className="rounded-md bg-primary px-2 py-0.5 text-primary-content text-xs"
									onClick={() =>
										action.run({
											nodeType,
											text: "<selected text>",
											surface,
										})
									}
									type="button"
								>
									Run
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="rounded-md border border-base-300 p-3">
				<div className="mb-2 text-base-content/60 text-xs uppercase">
					Invocation log
				</div>
				{log.length === 0 ? (
					<div className="text-base-content/60">No actions invoked yet.</div>
				) : (
					<ul className="flex flex-col gap-0.5 font-mono text-xs">
						{log.map((entry, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: log is append-only
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
