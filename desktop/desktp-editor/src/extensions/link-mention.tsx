import {
	autoUpdate,
	FloatingPortal,
	flip,
	offset,
	shift,
	useFloating,
	type VirtualElement,
} from "@floating-ui/react";
import type { Range } from "@tiptap/core";
import { type Editor, Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import {
	Suggestion,
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

export type MentionItem = {
	id: string;
	label: string;
	detail?: string;
	href: string;
	insertText?: string;
};

export type MentionProvider = {
	name: string;
	char: string;
	items: (query: string) => Promise<MentionItem[]>;
	placeholder?: string;
};

const navigationKeys = ["ArrowUp", "ArrowDown", "Enter"];

function MentionList({
	items,
	command,
	range,
	props,
	placeholder,
}: {
	items: MentionItem[];
	command: (item: MentionItem, range: Range) => void;
	range: Range;
	props: SuggestionProps;
	placeholder?: string;
}): React.JSX.Element | null {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const listRef = useRef<HTMLDivElement | null>(null);

	const { refs, floatingStyles, update } = useFloating({
		placement: "bottom-start",
		middleware: [offset(6), flip(), shift()],
		whileElementsMounted: autoUpdate,
		strategy: "fixed",
	});

	useLayoutEffect(() => {
		const rect = props.clientRect?.();
		if (!rect) return;
		const virtualEl: VirtualElement = {
			getBoundingClientRect: () => rect,
			contextElement: props.editor.view.dom as Element,
		};
		refs.setPositionReference(virtualEl);
		update();
	}, [props.clientRect, props.editor.view.dom, refs, update]);

	const selectItem = useCallback(
		(index: number) => {
			const item = items[index];
			if (item) command(item, range);
		},
		[command, items, range],
	);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!navigationKeys.includes(event.key)) return;
			event.preventDefault();
			if (event.key === "ArrowUp") {
				setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
				return;
			}
			if (event.key === "ArrowDown") {
				setSelectedIndex((prev) => (prev + 1) % items.length);
				return;
			}
			if (event.key === "Enter") {
				selectItem(selectedIndex);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [items.length, selectItem, selectedIndex]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [items]);

	useLayoutEffect(() => {
		const container = listRef.current;
		if (!container) return;
		const selected = container.children[selectedIndex] as
			| HTMLElement
			| undefined;
		if (selected) selected.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	return (
		<FloatingPortal>
			<div
				ref={refs.setFloating}
				style={floatingStyles}
				className="z-50 w-[320px] overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl"
			>
				<div className="border-b border-base-200 px-3 py-2 text-xs text-base-content/60">
					{placeholder ?? "Select a mention"}
				</div>
				<div ref={listRef} className="max-h-72 overflow-auto p-1">
					{items.length === 0 ? (
						<div className="px-3 py-2 text-xs text-base-content/60">
							No matches.
						</div>
					) : (
						items.map((item, index) => {
							const active = index === selectedIndex;
							return (
								<div
									key={item.id}
									className={[
										"cursor-default select-none rounded-lg px-3 py-2",
										active ? "bg-base-200" : "hover:bg-base-200/60",
									].join(" ")}
									onMouseEnter={() => setSelectedIndex(index)}
									onPointerDownCapture={(event) => {
										event.preventDefault();
										event.stopPropagation();
										selectItem(index);
									}}
								>
									<div className="text-sm font-medium">{item.label}</div>
									{item.detail ? (
										<div className="text-xs text-base-content/60">
											{item.detail}
										</div>
									) : null}
								</div>
							);
						})
					)}
				</div>
			</div>
		</FloatingPortal>
	);
}

function renderItems(placeholder?: string) {
	let component: ReactRenderer | null = null;

	return () => ({
		onStart: (props: SuggestionProps) => {
			component = new ReactRenderer(MentionList, {
				editor: props.editor,
				props: {
					...props,
					props,
					placeholder,
				},
			});
		},
		onUpdate: (props: SuggestionProps) => {
			component?.updateProps({
				...props,
				props,
				placeholder,
			});
		},
		onKeyDown: (props: SuggestionKeyDownProps) => {
			if (props.event.key === "Escape") return true;
			if (navigationKeys.includes(props.event.key)) return true;
			return false;
		},
		onExit: () => {
			component?.destroy();
			component = null;
		},
	});
}

export function createLinkMentionExtension(provider: MentionProvider) {
	return Extension.create({
		name: provider.name,
		addProseMirrorPlugins() {
			return [
				Suggestion({
					editor: this.editor,
					char: provider.char,
					items: ({ query }: { query: string }) => provider.items(query),
					command: ({
						editor,
						range,
						props,
					}: {
						editor: Editor;
						range: Range;
						props: MentionItem;
					}) => {
						const displayText =
							props.insertText ?? `${provider.char}${props.label}`;
						const start = range.from;
						const end = start + displayText.length;

						editor
							.chain()
							.focus()
							.insertContentAt(range, displayText)
							.setTextSelection({ from: start, to: end })
							.setLink({ href: props.href })
							.run();

						editor
							.chain()
							.focus()
							.insertContentAt(end, " ")
							.setTextSelection(end + 1)
							.run();
					},
					render: renderItems(provider.placeholder),
				}),
			];
		},
	});
}
