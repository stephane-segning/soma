import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { createLowlight } from "lowlight";
import { CodeBlockView } from "../components/code-block-view";

export const CodeBlockExtensionFn = (
	lowlight: ReturnType<typeof createLowlight>,
) =>
	CodeBlockLowlight.extend({
		// React NodeView lets us render a small language picker at the
		// top-right of every code block. `updateAttributes` from the
		// NodeViewProps writes back to `attrs.language`; lowlight then
		// rebuilds the highlight on the next render.
		addNodeView() {
			return ReactNodeViewRenderer(CodeBlockView);
		},
	}).configure({
		lowlight,
		defaultLanguage: "plaintext",
	});
