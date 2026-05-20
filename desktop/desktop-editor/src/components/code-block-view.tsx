/**
 * Code block NodeView — wraps Tiptap's CodeBlockLowlight rendering
 * with a discrete top-right language picker.
 *
 * The picker uses daisyUI's `select select-ghost select-xs` — a borderless,
 * background-less native select that the OS-styled dropdown opens from.
 * It writes back to the node's `language` attribute via
 * `updateAttributes`; lowlight then re-renders the syntax highlighting
 * on the next pass.
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
			className="not-prose relative my-4 overflow-hidden rounded-lg bg-neutral text-neutral-content"
			data-soma-code-block
		>
			<select
				aria-label="Code language"
				className="select select-ghost select-xs absolute right-2 top-1 z-10 text-neutral-content/60"
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
			<pre className="overflow-x-auto p-4 pt-3">
				<NodeViewContent className={`language-${current}`} />
			</pre>
		</NodeViewWrapper>
	);
}
