import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating, type VirtualElement } from "@floating-ui/react";
import type { Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getEditorDom } from "./dom";
import { navigationKeys } from "./keys";
import type { EditorCommand } from "./types";

export function CommandList({
	items,
	command,
	range,
	props,
}: {
	items: EditorCommand[];
	command: (item: EditorCommand, range: Range) => void;
	range: Range;
	props: SuggestionProps;
}): React.JSX.Element | null {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const listContainerRef = useRef<HTMLDivElement | null>(null);
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
		const selected = listContainerRef.current?.children[selectedIndex] as HTMLElement | undefined;
		selected?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (items.length === 0) return null;

	return (
		<FloatingPortal>
			<div ref={refs.setFloating} style={floatingStyles} className="z-50 w-[320px] overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl">
				<div ref={listContainerRef} className="max-h-72 overflow-auto p-1">
					{items.map((item, index) => (
						<CommandListItem active={index === selectedIndex} item={item} key={item.key} onSelect={() => selectItem(index)} onHover={() => setSelectedIndex(index)} />
					))}
				</div>
			</div>
		</FloatingPortal>
	);
}

function CommandListItem({ active, item, onHover, onSelect }: { active: boolean; item: EditorCommand; onHover: () => void; onSelect: () => void }) {
	return (
		<div
			className={["cursor-default select-none rounded-lg px-3 py-2", active ? "bg-base-200" : "hover:bg-base-200/60"].join(" ")}
			onMouseEnter={onHover}
			onPointerDownCapture={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onSelect();
			}}
		>
			<div className="text-sm font-medium">{item.name}</div>
			{item.description ? <div className="text-xs text-base-content/60">{item.description}</div> : null}
		</div>
	);
}
