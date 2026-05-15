import { autoUpdate, FloatingPortal, flip, offset, shift, useFloating, type VirtualElement } from "@floating-ui/react";
import type { Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getEditorDom, navigationKeys } from "./dom";
import type { MentionItem } from "./types";

type MentionListProps = {
	items: MentionItem[];
	command: (item: MentionItem, range: Range) => void;
	range: Range;
	props: SuggestionProps;
	placeholder?: string;
};

export function MentionList({ items, command, range, props, placeholder }: MentionListProps): React.JSX.Element {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const listRef = useRef<HTMLDivElement | null>(null);
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

	const selectItem = useCallback((index: number) => {
		const item = items[index];
		if (item) command(item, range);
	}, [command, items, range]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!navigationKeys.includes(event.key)) return;
			event.preventDefault();
			if (event.key === "ArrowUp") setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
			if (event.key === "ArrowDown") setSelectedIndex((prev) => (prev + 1) % items.length);
			if (event.key === "Enter") selectItem(selectedIndex);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [items.length, selectItem, selectedIndex]);

	useEffect(() => setSelectedIndex(0), [items]);
	useLayoutEffect(() => {
		const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
		selected?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	return (
		<FloatingPortal>
			<div ref={refs.setFloating} style={floatingStyles} className="z-50 w-[320px] overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl">
				<div className="border-b border-base-200 px-3 py-2 text-xs text-base-content/60">{placeholder ?? "Select a mention"}</div>
				<div ref={listRef} className="max-h-72 overflow-auto p-1">
					{items.length === 0 ? <div className="px-3 py-2 text-xs text-base-content/60">No matches.</div> : items.map((item, index) => (
						<MentionListItem active={index === selectedIndex} item={item} key={item.id} onHover={() => setSelectedIndex(index)} onSelect={() => selectItem(index)} />
					))}
				</div>
			</div>
		</FloatingPortal>
	);
}

function MentionListItem({ active, item, onHover, onSelect }: { active: boolean; item: MentionItem; onHover: () => void; onSelect: () => void }) {
	return (
		<div role="menu" className={["cursor-default select-none rounded-lg px-3 py-2", active ? "bg-base-200" : "hover:bg-base-200/60"].join(" ")} onMouseEnter={onHover} onPointerDownCapture={(event) => {
			event.preventDefault();
			event.stopPropagation();
			onSelect();
		}}>
			<div className="text-sm font-medium">{item.label}</div>
			{item.detail ? <div className="text-xs text-base-content/60">{item.detail}</div> : null}
		</div>
	);
}
