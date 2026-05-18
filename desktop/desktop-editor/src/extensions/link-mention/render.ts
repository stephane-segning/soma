import type { MentionSectionKind } from "@soma/ui/components/editor/mention-picker";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { getEditorDom, navigationKeys } from "./dom";
import { MentionList } from "./mention-list";

export function renderMentionItems(placeholder: string | undefined, section: MentionSectionKind) {
	return () => {
		let component: ReactRenderer | null = null;

		function destroy() {
			component?.destroy();
			component = null;
		}

		function buildProps(props: SuggestionProps) {
			return { ...props, props, placeholder, section, onDismiss: destroy };
		}

		return {
			onStart: (props: SuggestionProps) => {
				if (!getEditorDom(props.editor)) return;
				component = new ReactRenderer(MentionList, {
					editor: props.editor,
					props: buildProps(props),
				});
			},
			onUpdate: (props: SuggestionProps) => {
				if (!component && !getEditorDom(props.editor)) return;
				if (!component) {
					component = new ReactRenderer(MentionList, {
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
	};
}
