import {
	autoUpdate,
	flip,
	FloatingPortal,
	offset,
	shift,
	useFloating,
	type VirtualElement,
} from "@floating-ui/react";
import type { Range } from "@tiptap/core";
import { Editor, Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type EditorCommand = {
	key: string;
	name: string;
	description?: string;
	keywords?: string[];
	disabled?: boolean;
	handler(args: { editor: Editor; range: Range }): void | Promise<void>;
};

type CommanderOptions = {
	commands: EditorCommand[];
};

const navigationKeys = ["ArrowUp", "ArrowDown", "Enter"];
const COMMANDER_SUGGESTION_KEY = new PluginKey("commander-suggestion");

function getEditorDom(editor: Editor): Element | null {
	const element = editor.options.element;
	return element instanceof Element ? element : null;
}

function filterCommands(query: string, commands: EditorCommand[]): EditorCommand[] {
	if (query.length === 0) return commands;
	const search = query.toLowerCase();
	return commands.filter((command) => {
		if (command.disabled) return false;
		return (
			command.name.toLowerCase().includes(search) ||
			(command.description?.toLowerCase().includes(search) ?? false) ||
			(command.keywords?.some((k) => k.toLowerCase().includes(search)) ?? false)
		);
	});
}

function CommandList({
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
		let rect: DOMRect | null = null;
		try {
			rect = props.clientRect?.() ?? null;
		} catch {
			rect = null;
		}
		if (!rect) return;
		const contextElement = getEditorDom(props.editor);
		if (!contextElement) return;

		const virtualEl: VirtualElement = {
			getBoundingClientRect: () => rect,
			contextElement,
		};
		refs.setPositionReference(virtualEl);
		update();
	}, [props.clientRect, props.editor, refs, update]);

	const selectItem = useCallback(
		(index: number) => {
			const item = items[index];
			if (!item) return;
			command(item, range);
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
		const container = listContainerRef.current;
		if (!container) return;
		const selected = container.children[selectedIndex] as HTMLElement | undefined;
		if (!selected) return;
		selected.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (items.length === 0) return null;

	return (
		<FloatingPortal>
			<div
				ref={refs.setFloating}
				style={floatingStyles}
				className="z-50 w-[320px] overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl"
			>
				<div ref={listContainerRef} className="max-h-72 overflow-auto p-1">
					{items.map((item, index) => {
						const active = index === selectedIndex;
						return (
							<div
								key={item.key}
								className={[
									"cursor-default select-none rounded-lg px-3 py-2",
									active ? "bg-base-200" : "hover:bg-base-200/60",
								].join(" ")}
								onMouseEnter={() => setSelectedIndex(index)}
								onPointerDownCapture={(e) => {
									// `onClick` often loses to ProseMirror selection changes; capture pointer down.
									e.preventDefault();
									e.stopPropagation();
									selectItem(index);
								}}
							>
								<div className="text-sm font-medium">{item.name}</div>
								{item.description ? (
									<div className="text-xs text-base-content/60">{item.description}</div>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		</FloatingPortal>
	);
}

function renderItems() {
	let component: ReactRenderer | null = null;

	return {
		onStart: (props: SuggestionProps) => {
			if (!getEditorDom(props.editor)) return;
			component = new ReactRenderer(CommandList, {
				editor: props.editor,
				props: {
					...props,
					props,
				},
			});
		},
		onUpdate: (props: SuggestionProps) => {
			if (!component) {
				if (!getEditorDom(props.editor)) return;
				component = new ReactRenderer(CommandList, {
					editor: props.editor,
					props: {
						...props,
						props,
					},
				});
				return;
			}
			component?.updateProps({
				...props,
				props,
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
	};
}

export const CommanderExtension = Extension.create<CommanderOptions>({
	name: "commander",

	addOptions() {
		return {
			commands: [],
		};
	},

	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				pluginKey: COMMANDER_SUGGESTION_KEY,
				char: "/",
				items: ({ query }: { query: string }) =>
					filterCommands(query, this.options.commands),
				command: async ({
					editor,
					range,
					props,
				}: {
					editor: Editor;
					range: Range;
					props: EditorCommand;
				}) => {
					const result = props.handler({ editor, range });
					if (result instanceof Promise) await result;
				},
				render: renderItems,
			}),
		];
	},
});
