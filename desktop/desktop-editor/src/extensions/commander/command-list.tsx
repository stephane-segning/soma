import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating, type VirtualElement } from "@floating-ui/react";
import { SlashMenu, type SlashMenuItem } from "@soma/ui/components/editor/slash-menu";
import type { Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import { useLayoutEffect, useMemo } from "react";
import { getEditorDom } from "./dom";
import type { EditorCommand } from "./types";

/**
 * Bridges TipTap's suggestion plugin to `@soma/ui`'s `SlashMenu`. The
 * suggestion plugin owns the `/` trigger + the `range` to replace; the
 * menu owns the keyboard nav, filtering, AI-prompt fallback, and
 * rendering per [refs editor §1](../../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor.md).
 *
 * Positioning is wired here via `@floating-ui/react` anchored to the
 * caret rectangle the suggestion plugin reports through `clientRect`.
 */
export function CommandList({
	items,
	command,
	range,
	props,
	onDismiss,
}: {
	items: EditorCommand[];
	command: (item: EditorCommand, range: Range) => void;
	range: Range;
	props: SuggestionProps;
	/**
	 * Called when the menu requests dismissal (Esc, AI fallback). The
	 * renderer destroys the React component; the suggestion plugin's
	 * `onUpdate` re-creates it if the user keeps typing.
	 */
	onDismiss: () => void;
}): React.JSX.Element | null {
	const { refs, floatingStyles, update } = useFloating({
		placement: "bottom-start",
		middleware: [offset(6), flip(), shift()],
		whileElementsMounted: autoUpdate,
		strategy: "fixed",
	});

	useLayoutEffect(() => {
		const rect = props.clientRect?.() ?? null;
		const contextElement = getEditorDom(props.editor);
		if (!rect || !contextElement) return;
		const virtualEl: VirtualElement = { getBoundingClientRect: () => rect, contextElement };
		refs.setPositionReference(virtualEl);
		update();
	}, [props.clientRect, props.editor, refs, update]);

	const slashItems = useMemo<SlashMenuItem[]>(
		() =>
			items
				.filter((item) => !item.disabled)
				.map((item) => ({
					id: item.key,
					label: item.name,
					aliases: [
						item.description,
						...(item.keywords ?? []),
					].filter((v): v is string => Boolean(v)),
					icon: item.icon,
					shortcut: item.shortcut,
					section: item.section,
					onSelect: () => command(item, range),
				})),
		[command, items, range],
	);

	return (
		<FloatingPortal>
			<div ref={refs.setFloating} style={floatingStyles} className="z-50">
				<SlashMenu
					captureScope="window"
					items={slashItems}
					onClose={onDismiss}
					query={props.query}
				/>
			</div>
		</FloatingPortal>
	);
}
