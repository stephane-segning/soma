import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { CommandList } from "./command-list";
import { getEditorDom } from "./dom";
import { navigationKeys } from "./keys";

export function renderCommanderItems() {
	let component: ReactRenderer | null = null;

	return {
		onStart: (props: SuggestionProps) => {
			if (!getEditorDom(props.editor)) return;
			component = new ReactRenderer(CommandList, {
				editor: props.editor,
				props: { ...props, props },
			});
		},
		onUpdate: (props: SuggestionProps) => {
			if (!component && !getEditorDom(props.editor)) return;
			if (!component) {
				component = new ReactRenderer(CommandList, {
					editor: props.editor,
					props: { ...props, props },
				});
				return;
			}
			component.updateProps({ ...props, props });
		},
		onKeyDown: (props: SuggestionKeyDownProps) => props.event.key === "Escape" || navigationKeys.includes(props.event.key),
		onExit: () => {
			component?.destroy();
			component = null;
		},
	};
}
