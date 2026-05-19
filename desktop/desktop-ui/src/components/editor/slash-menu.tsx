/**
 * SlashMenu — single-column popover anchored at the caret.
 *
 * Locked by [refs editor §1](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor.md)
 * and [ADR-0005 §11](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md).
 *
 * Rows = monochrome icon + label + right-aligned shortcut hint.
 * Sections in fixed order: Text · List · Embed · Action · Advanced.
 *
 * **No AI tile** (ADR lock). Instead, when the user's typed text
 * does not match any block name, the leading input doubles as the
 * AI prompt entry — calling `onAIPrompt(query)` dispatches to the
 * inline-AI surface (ADR-0005 §13). One surface, two modes, no
 * duplicate tile.
 *
 * Positioning is the caller's job — the menu is presentational so
 * the TipTap extension can anchor it at the caret.
 */
import {
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Star } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { MenuItem, MenuSectionLabel, MenuShell } from "../overlays/menu-shell";

export type SlashMenuSection =
	| "text"
	| "list"
	| "embed"
	| "action"
	| "advanced";

export type SlashMenuItem = {
	id: string;
	label: string;
	/** Substring filter targets in addition to `label`. */
	aliases?: string[];
	/** Keyboard shortcut hint shown right-aligned (display only). */
	shortcut?: string;
	icon?: ReactNode;
	section: SlashMenuSection;
	onSelect: () => void;
};

export type SlashMenuProps = {
	items: SlashMenuItem[];
	/** Current text after the leading `/`. */
	query: string;
	onClose: () => void;
	/**
	 * When the typed `query` matches no block name (so the result list
	 * is empty), pressing Enter dispatches to this callback with the
	 * raw query — see ADR-0005 §11 + §13. If undefined, the menu shows
	 * a plain empty state.
	 */
	onAIPrompt?: (prompt: string) => void;
	/**
	 * Where the keyboard handler scopes itself. `"container"` (default)
	 * only fires on events with `target` inside the menu — useful when
	 * the menu owns focus. `"window"` listens on every key, useful when
	 * focus stays in a host editor (e.g. TipTap's contenteditable while
	 * the slash menu is open).
	 */
	captureScope?: "container" | "window";
	className?: string;
};

const SECTION_ORDER: SlashMenuSection[] = [
	"text",
	"list",
	"embed",
	"action",
	"advanced",
];

export function SlashMenu({
	items,
	query,
	onClose,
	onAIPrompt,
	captureScope = "container",
	className,
}: SlashMenuProps) {
	const t = useT();

	const sectionLabel: Record<SlashMenuSection, string> = {
		text: t({ id: "slash-menu.section.text", defaultMessage: "Text" }),
		list: t({ id: "slash-menu.section.list", defaultMessage: "List" }),
		embed: t({ id: "slash-menu.section.embed", defaultMessage: "Embed" }),
		action: t({ id: "slash-menu.section.action", defaultMessage: "Action" }),
		advanced: t({
			id: "slash-menu.section.advanced",
			defaultMessage: "Advanced",
		}),
	};

	// Filter + group, preserving section + insertion order.
	const grouped = useMemo(() => {
		const lower = query.toLowerCase();
		const matches = items.filter((item) => {
			if (lower.length === 0) return true;
			if (item.label.toLowerCase().includes(lower)) return true;
			return item.aliases?.some((a) => a.toLowerCase().includes(lower));
		});
		const buckets = new Map<SlashMenuSection, SlashMenuItem[]>();
		for (const section of SECTION_ORDER) buckets.set(section, []);
		for (const item of matches) buckets.get(item.section)?.push(item);
		return SECTION_ORDER
			.map((section) => ({
				section,
				items: buckets.get(section) ?? [],
			}))
			.filter((g) => g.items.length > 0);
	}, [items, query]);

	const flat = useMemo(
		() => grouped.flatMap((g) => g.items),
		[grouped],
	);

	const [activeIndex, setActiveIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement | null>(null);
	// Tracks whether the last activeIndex change came from keyboard nav.
	// Mouse-hover also sets activeIndex (so the visible highlight follows
	// the cursor), but in that case the row is already on-screen and
	// scrollIntoView would cause the menu to *visibly jitter* under the
	// mouse — looking like the items "scale" on hover. Keyboard nav, on
	// the other hand, genuinely needs the scroll.
	const keyboardNavRef = useRef(false);
	// Reset when the result set changes so the highlight stays in-bounds.
	useEffect(() => {
		setActiveIndex(0);
	}, [flat]);

	// Keep the active option visible when *keyboard* navigation moves past
	// the visible viewport. Mouse-hover already implies the row is in view,
	// so we deliberately skip scrolling in that case.
	useEffect(() => {
		if (!keyboardNavRef.current) return;
		keyboardNavRef.current = false;
		const container = containerRef.current;
		if (!container) return;
		const active = container.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
		active?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (captureScope === "container") {
				// Only respond when the event originated inside this instance —
				// otherwise multiple slash menus on the page would all react.
				const target = event.target;
				if (!(target instanceof Node)) return;
				if (!containerRef.current?.contains(target)) return;
			}
			if (event.key === "ArrowDown") {
				event.preventDefault();
				keyboardNavRef.current = true;
				setActiveIndex((idx) =>
					flat.length === 0 ? 0 : (idx + 1) % flat.length,
				);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				keyboardNavRef.current = true;
				setActiveIndex((idx) =>
					flat.length === 0 ? 0 : (idx - 1 + flat.length) % flat.length,
				);
			} else if (event.key === "Enter") {
				event.preventDefault();
				if (flat.length > 0) {
					flat[activeIndex]?.onSelect();
				} else if (onAIPrompt && query.trim().length > 0) {
					onAIPrompt(query.trim());
				}
			} else if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [flat, activeIndex, onClose, onAIPrompt, query, captureScope]);

	// Empty + onAIPrompt available → AI fallback row instead of a plain empty state.
	if (flat.length === 0 && onAIPrompt && query.trim().length > 0) {
		return (
			<MenuShell className={className} ref={containerRef} role="listbox" width="w-80">
				<button
					aria-selected="true"
					className="flex items-center gap-2 rounded-md bg-info/10 px-2 py-1.5 text-left text-info text-ui-sm"
					onClick={() => onAIPrompt(query.trim())}
					role="option"
					type="button"
				>
					<Star aria-hidden className="size-4 shrink-0" />
					<span className="min-w-0 flex-1 truncate">
						{t({
							id: "slash-menu.ai-fallback",
							defaultMessage: "Ask AI: {prompt}",
							values: { prompt: query.trim() },
						})}
					</span>
					<span className="text-info/60 text-ui-xs">↵</span>
				</button>
			</MenuShell>
		);
	}

	if (flat.length === 0) {
		return (
			<MenuShell className={cn("text-base-content/60 text-ui-sm", className)} ref={containerRef} width="w-80">
				<div className="px-2 py-1.5">
					{t({ id: "slash-menu.empty", defaultMessage: "No matches" })}
				</div>
			</MenuShell>
		);
	}

	let runningIndex = 0;
	return (
		<MenuShell
			className={cn("max-h-80 overflow-y-auto", className)}
			ref={containerRef}
			role="listbox"
			width="w-80"
		>
			{grouped.map((group) => (
				<div className="flex flex-col gap-0.5" key={group.section}>
					<MenuSectionLabel>{sectionLabel[group.section]}</MenuSectionLabel>
					{group.items.map((item) => {
						const isActive = runningIndex === activeIndex;
						const ownIndex = runningIndex;
						runningIndex += 1;
						return (
							<MenuItem
								active={isActive}
								icon={item.icon}
								key={item.id}
								label={item.label}
								onClick={() => item.onSelect()}
								onMouseEnter={() => setActiveIndex(ownIndex)}
								role="option"
								shortcut={item.shortcut}
							/>
						);
					})}
				</div>
			))}
		</MenuShell>
	);
}
