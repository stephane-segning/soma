import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { getEditorDom, navigationKeys } from "./dom";
import { MentionList } from "./mention-list";

export function renderMentionItems(placeholder?: string) {
	let component: ReactRenderer | null = null;

	return () => ({
		onStart: (props: SuggestionProps) => {
			if (!getEditorDom(props.editor)) return;
			component = new ReactRenderer(MentionList, {
				editor: props.editor,
				props: { ...props, props, placeholder },
			});
		},
		onUpdate: (props: SuggestionProps) => {
			if (!component && !getEditorDom(props.editor)) return;
			if (!component) {
				component = new ReactRenderer(MentionList, {
					editor: props.editor,
					props: { ...props, props, placeholder },
				});
				return;
			}
			component.updateProps({ ...props, props, placeholder });
		},
		onKeyDown: (props: SuggestionKeyDownProps) => props.event.key === "Escape" || navigationKeys.includes(props.event.key),
		onExit: () => {
			component?.destroy();
			component = null;
		},
	});
}
