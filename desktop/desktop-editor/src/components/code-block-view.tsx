/**
 * Code block NodeView — wraps Tiptap's CodeBlockLowlight rendering
 * with a discrete top-right language picker. The picker writes back
 * to the node's `language` attribute via `updateAttributes`; lowlight
 * then re-renders the syntax highlighting on the next pass.
 *
 * The picker is intentionally low-key — a muted label + chevron with
 * no background, like a quiet metadata line — so it doesn't compete
 * with the syntax-highlighted code itself.
 *
 * Languages are scoped to whatever we registered in `hooks/lowlight.ts`
 * plus a literal "plain text" option for the unhighlighted case.
 */
import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ChevronDown } from "react-feather";

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
	const label = LANGUAGES.find((lang) => lang.value === current)?.label ?? "Plain text";

	return (
		<NodeViewWrapper
			as="div"
			className="not-prose relative my-4 overflow-hidden rounded-lg bg-neutral text-neutral-content"
			data-soma-code-block
		>
			{/* Discrete picker: just the label + a chevron, no border, no
			    background. The native <select> sits invisibly over the label
			    so clicking opens the OS picker without us having to build a
			    custom popover. */}
			<label
				className="absolute right-3 top-2 z-10 inline-flex cursor-pointer items-center gap-1 text-neutral-content/50 text-ui-xs hover:text-neutral-content/80"
				contentEditable={false}
				onMouseDown={(event) => event.stopPropagation()}
			>
				<span aria-hidden>{label}</span>
				<ChevronDown aria-hidden className="size-3" />
				<select
					aria-label="Code language"
					className="absolute inset-0 cursor-pointer opacity-0"
					onChange={(event) => updateAttributes({ language: event.target.value })}
					value={current}
				>
					{LANGUAGES.map((lang) => (
						<option key={lang.value} value={lang.value}>
							{lang.label}
						</option>
					))}
				</select>
			</label>
			<pre className="overflow-x-auto p-4 pt-3">
				<NodeViewContent className={`language-${current}`} />
			</pre>
		</NodeViewWrapper>
	);
}
