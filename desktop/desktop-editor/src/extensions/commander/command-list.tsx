import {
	arrow,
	autoUpdate,
	flip,
	FloatingPortal,
	hide,
	offset,
	shift,
	useFloating,
	type VirtualElement,
} from "@floating-ui/react";
import { SlashMenu, type SlashMenuItem } from "@soma/ui/components/editor/slash-menu";
import type { Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
	const arrowRef = useRef<HTMLDivElement | null>(null);
	const { refs, floatingStyles, middlewareData, placement, update } = useFloating({
		placement: "bottom-start",
		middleware: [
			offset(8),
			flip(),
			shift({ padding: 8 }),
			arrow({ element: arrowRef }),
			// `hide()` exposes `referenceHidden: true` once the caret rect is
			// clipped by its scroll container or scrolled off-screen. We
			// listen for that in the effect below and dismiss the menu, so a
			// user who types `/` then scrolls the page doesn't end up with a
			// stale menu floating over unrelated content.
			hide({ strategy: "referenceHidden" }),
		],
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

	// Close the menu when the trigger character ("/") scrolls out of
	// view. `hide()` flips `referenceHidden` true when the reference
	// rect is clipped; `autoUpdate` already ensures the floating
	// position follows scroll, so this just adds the dismissal contract.
	const referenceHidden = middlewareData.hide?.referenceHidden ?? false;
	useEffect(() => {
		if (referenceHidden) onDismiss();
	}, [referenceHidden, onDismiss]);

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

	const arrowSide = placement.split("-")[0] as "top" | "bottom" | "left" | "right";
	// The arrow visually anchors the menu to the trigger char ("/") by
	// drawing a notch on the menu edge nearest the caret. Floating-ui's
	// `arrow()` middleware gives the offset along the edge; we flip the
	// static side to match flip() picking a different placement.
	const oppositeSide: Record<typeof arrowSide, "top" | "bottom" | "left" | "right"> = {
		top: "bottom",
		bottom: "top",
		left: "right",
		right: "left",
	};
	const arrowStaticSide = oppositeSide[arrowSide];
	const arrowX = middlewareData.arrow?.x;
	const arrowY = middlewareData.arrow?.y;

	return (
		<FloatingPortal>
			<div ref={refs.setFloating} style={floatingStyles} className="z-50">
				<SlashMenu
					captureScope="window"
					items={slashItems}
					onClose={onDismiss}
					query={props.query}
				/>
				<div
					aria-hidden
					className="absolute size-2 rotate-45 border-base-300 bg-base-100"
					ref={arrowRef}
					style={{
						left: arrowX != null ? `${arrowX}px` : undefined,
						top: arrowY != null ? `${arrowY}px` : undefined,
						[arrowStaticSide]: "-4px",
						// Border on only the two sides facing away from the menu so
						// the rotated square looks like an arrowhead, not a diamond.
						borderTopWidth: arrowStaticSide === "top" || arrowStaticSide === "left" ? 1 : 0,
						borderLeftWidth: arrowStaticSide === "top" || arrowStaticSide === "left" ? 1 : 0,
						borderRightWidth: arrowStaticSide === "bottom" || arrowStaticSide === "right" ? 1 : 0,
						borderBottomWidth: arrowStaticSide === "bottom" || arrowStaticSide === "right" ? 1 : 0,
					}}
				/>
			</div>
		</FloatingPortal>
	);
}
