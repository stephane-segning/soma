import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import type { createLowlight } from "lowlight";

export const CodeBlockExtensionFn = (
	lowlight: ReturnType<typeof createLowlight>,
) =>
	CodeBlockLowlight.configure({
		lowlight,
		defaultLanguage: "plaintext",
	});
