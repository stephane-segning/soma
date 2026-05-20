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
import { useLayoutEffect, useMemo, useRef } from "react";
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
	// `lastValidRect` survives across autoUpdate cycles. When TipTap
	// transiently can't compute a caret rect (fast edits, selection
	// being recomputed), `props.clientRect()` returns `null` — without
	// the cache the previous code fell back to `new DOMRect()` which
	// teleports the menu to viewport (0, 0). Returning the last known
	// rect keeps the menu pinned to the trigger character; the `hide`
	// middleware below additionally `visibility: hidden`s the menu
	// when even that fallback is unavailable (very first frame, etc.).
	const lastValidRectRef = useRef<DOMRect | null>(null);
	const { refs, floatingStyles, middlewareData, placement, update } = useFloating({
		placement: "bottom-start",
		middleware: [
			offset(8),
			flip(),
			shift({ padding: 8 }),
			arrow({ element: arrowRef }),
			hide({ strategy: "referenceHidden" }),
		],
		whileElementsMounted: autoUpdate,
		strategy: "fixed",
	});

	useLayoutEffect(() => {
		const clientRect = props.clientRect;
		const contextElement = getEditorDom(props.editor);
		if (!clientRect || !contextElement) return;
		// IMPORTANT: read `clientRect()` *inside* `getBoundingClientRect`
		// rather than once at effect time. autoUpdate fires this getter on
		// every scroll/resize, and Tiptap's suggestion plugin keeps the
		// caller's `clientRect` callback in sync with the trigger's
		// position — so reading fresh each call makes the menu follow the
		// `/` character through page scroll instead of sticking at the
		// position it had when it opened.
		//
		// When `clientRect()` returns `null` (TipTap can't produce a
		// caret rect this frame), reuse the last known rect so the menu
		// stays anchored to where the trigger character was. The `hide`
		// middleware below hides the menu if we genuinely have no rect
		// at all.
		const virtualEl: VirtualElement = {
			getBoundingClientRect: () => {
				const rect = clientRect();
				if (rect) {
					lastValidRectRef.current = rect;
					return rect;
				}
				return lastValidRectRef.current ?? new DOMRect(-10000, -10000, 0, 0);
			},
			contextElement,
		};
		refs.setPositionReference(virtualEl);
		update();
	}, [props.clientRect, props.editor, refs, update]);

	// `hide` middleware reports `referenceHidden = true` when the
	// reference (caret) is off-screen or otherwise not visible. We hide
	// the menu via `visibility` (not display) so floating-ui keeps
	// computing position and we re-appear seamlessly when the caret
	// comes back into view.
	const referenceHidden = middlewareData.hide?.referenceHidden ?? false;

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
			<div
				ref={refs.setFloating}
				style={{
					...floatingStyles,
					visibility: referenceHidden ? "hidden" : floatingStyles.visibility,
					pointerEvents: referenceHidden ? "none" : floatingStyles.pointerEvents,
				}}
				className="z-50"
			>
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
