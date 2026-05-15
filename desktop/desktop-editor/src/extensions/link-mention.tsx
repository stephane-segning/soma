import type { Range } from "@tiptap/core";
import { type Editor, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { renderMentionItems } from "./link-mention/render";
import type { MentionItem, MentionProvider } from "./link-mention/types";

export type { MentionItem, MentionProvider };

export function createLinkMentionExtension(provider: MentionProvider) {
	const pluginKey = new PluginKey(`mention-suggestion-${provider.name}-${provider.char}`);
	return Extension.create({
		name: provider.name,
		addProseMirrorPlugins() {
			return [
				Suggestion({
					editor: this.editor,
					pluginKey,
					char: provider.char,
					items: ({ query }: { query: string }) => provider.items(query),
					command: ({ editor, range, props }: { editor: Editor; range: Range; props: MentionItem }) => {
						insertMentionLink(editor, range, provider.char, props);
					},
					render: renderMentionItems(provider.placeholder),
				}),
			];
		},
	});
}

function insertMentionLink(editor: Editor, range: Range, mentionChar: string, item: MentionItem): void {
	const displayText = item.insertText ?? `${mentionChar}${item.label}`;
	const start = range.from;
	const end = start + displayText.length;

	editor.chain().focus().insertContentAt(range, displayText).setTextSelection({ from: start, to: end }).setLink({ href: item.href }).run();
	editor.chain().focus().insertContentAt(end, " ").setTextSelection(end + 1).run();
}
