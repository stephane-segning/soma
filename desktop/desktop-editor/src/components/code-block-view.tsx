/**
 * Code block NodeView — wraps Tiptap's CodeBlockLowlight rendering
 * with a top-right language picker. The picker writes back to the
 * node's `language` attribute via `updateAttributes`; lowlight then
 * re-renders the syntax highlighting on the next pass.
 *
 * Languages are scoped to whatever we registered in `hooks/lowlight.ts`
 * plus a literal "plain text" option for the unhighlighted case.
 */
import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from "@tiptap/react";

const LANGUAGES: Array<{ value: string; label: string }> = [
	{ value: "plaintext", label: "Plain text" },
	{ value: "bash", label: "Bash" },
	{ value: "css", label: "CSS" },
	{ value: "javascript", label: "JavaScript" },
	{ value: "json", label: "JSON" },
	{ value: "markdown", label: "Markdown" },
	{ value: "rust", label: "Rust" },
	{ value: "typescript", label: "TypeScript" },
	{ value: "xml", label: "XML / HTML" },
	{ value: "yaml", label: "YAML" },
];

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
	const current = (node.attrs.language as string | undefined) ?? "plaintext";

	return (
		<NodeViewWrapper
			as="div"
			className="not-prose relative my-4"
			data-soma-code-block
		>
			<select
				aria-label="Code language"
				className="absolute right-2 top-2 z-10 rounded-md border border-base-300 bg-base-100/90 px-2 py-0.5 text-base-content/70 text-ui-xs backdrop-blur-sm hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
				// Stops the click from selecting the node + initiating a drag.
				contentEditable={false}
				onChange={(event) => updateAttributes({ language: event.target.value })}
				onMouseDown={(event) => event.stopPropagation()}
				value={current}
			>
				{LANGUAGES.map((lang) => (
					<option key={lang.value} value={lang.value}>
						{lang.label}
					</option>
				))}
			</select>
			<pre className="overflow-x-auto rounded-lg bg-neutral text-neutral-content">
				<NodeViewContent className={`language-${current}`} />
			</pre>
		</NodeViewWrapper>
	);
}
