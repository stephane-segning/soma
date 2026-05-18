import { autoUpdate, FloatingPortal, flip, offset, shift, useFloating, type VirtualElement } from "@floating-ui/react";
import { MentionPicker, type MentionItem as PickerItem, type MentionSectionKind } from "@soma/ui/components/editor/mention-picker";
import type { Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import { useLayoutEffect, useMemo } from "react";
import { getEditorDom } from "./dom";
import type { MentionItem } from "./types";

/**
 * Bridges TipTap's suggestion plugin to `@soma/ui`'s `MentionPicker`.
 * Each provider is one extension with its own trigger char, so each
 * popover renders a single section (members / documents / spaces /
 * bots) — the picker hides empty sections so the visual layout still
 * matches the locked PRD.
 */
type MentionListProps = {
	items: MentionItem[];
	command: (item: MentionItem, range: Range) => void;
	range: Range;
	props: SuggestionProps;
	placeholder?: string;
	section: MentionSectionKind;
	onDismiss: () => void;
};

export function MentionList({ items, command, range, props, section, onDismiss }: MentionListProps): React.JSX.Element {
	const { refs, floatingStyles, update } = useFloating({
		placement: "bottom-start",
		middleware: [offset(6), flip(), shift()],
		whileElementsMounted: autoUpdate,
		strategy: "fixed",
	});

	useLayoutEffect(() => {
		let rect: DOMRect | null = null;
		try {
			rect = props.clientRect?.() ?? null;
		} catch {
			rect = null;
		}
		const contextElement = getEditorDom(props.editor);
		if (!rect || !contextElement) return;
		const virtualEl: VirtualElement = { getBoundingClientRect: () => rect, contextElement };
		refs.setPositionReference(virtualEl);
		update();
	}, [props.clientRect, props.editor, refs, update]);

	const itemsById = useMemo(() => {
		const map = new Map<string, MentionItem>();
		for (const item of items) map.set(item.id, item);
		return map;
	}, [items]);

	const pickerItems = useMemo<PickerItem[]>(
		() =>
			items.map((item) => ({
				id: item.id,
				label: item.label,
				meta: item.detail,
				isBot: section === "bots",
			})),
		[items, section],
	);

	const sections = useMemo(
		() => [{ kind: section, items: pickerItems }],
		[section, pickerItems],
	);

	return (
		<FloatingPortal>
			<div ref={refs.setFloating} style={floatingStyles} className="z-50">
				<MentionPicker
					captureScope="window"
					onClose={onDismiss}
					onSelect={(picked) => {
						const item = itemsById.get(picked.id);
						if (item) command(item, range);
					}}
					query={props.query}
					sections={sections}
				/>
			</div>
		</FloatingPortal>
	);
}
