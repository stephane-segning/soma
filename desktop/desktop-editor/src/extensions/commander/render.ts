import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { CommandList } from "./command-list";
import { getEditorDom } from "./dom";
import { navigationKeys } from "./keys";

export function renderCommanderItems() {
	let component: ReactRenderer | null = null;

	function destroy() {
		component?.destroy();
		component = null;
	}

	function buildProps(props: SuggestionProps) {
		return { ...props, props, onDismiss: destroy };
	}

	return {
		onStart: (props: SuggestionProps) => {
			if (!getEditorDom(props.editor)) return;
			component = new ReactRenderer(CommandList, {
				editor: props.editor,
				props: buildProps(props),
			});
		},
		onUpdate: (props: SuggestionProps) => {
			if (!component && !getEditorDom(props.editor)) return;
			if (!component) {
				component = new ReactRenderer(CommandList, {
					editor: props.editor,
					props: buildProps(props),
				});
				return;
			}
			component.updateProps(buildProps(props));
		},
		onKeyDown: (props: SuggestionKeyDownProps) => {
			if (props.event.key === "Escape") {
				destroy();
				return true;
			}
			return navigationKeys.includes(props.event.key);
		},
		onExit: () => {
			destroy();
		},
	};
}
