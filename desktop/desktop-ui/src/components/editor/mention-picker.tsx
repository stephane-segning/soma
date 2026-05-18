/**
 * MentionPicker — sectioned `@`-mention popover for the chat composer
 * (and v0.1 for editor content). Locked sections in priority order:
 * **Bots → Documents → Members**.
 *
 * Locked by [refs main §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md)
 * and ADR-0005 §4 — bot mentions render with a distinct icon + tint
 * so the user sees at a glance that a mention dispatches a command to
 * a bot runtime, not generates an LLM completion.
 *
 * The picker is **presentational**: positioning is the caller's job
 * (chat composer / editor extension wraps it in its own floating
 * surface anchored at the caret). The picker just renders + handles
 * keyboard nav + filtering.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Cpu } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type MentionItem = {
	id: string;
	/** Display label (e.g. "fetcher", "Project plan", "Stéphane"). */
	label: string;
	/** Optional 16px icon. Bots get a distinct one (see `isBot`). */
	icon?: ReactNode;
	/** Small right-aligned subtext (peer id, doc path, role, etc.). */
	meta?: ReactNode;
	/**
	 * Marks the item as a bot reference. Renders with a distinct icon
	 * + surface tint so the user sees the mention dispatches to a bot
	 * runtime instead of the LLM.
	 */
	isBot?: boolean;
};

export type MentionSectionKind = "bots" | "documents" | "members";

export type MentionSection = {
	kind: MentionSectionKind;
	items: MentionItem[];
};

export type MentionPickerProps = {
	sections: MentionSection[];
	/**
	 * Current substring filter (the text the user typed after the `@`).
	 * The picker filters every section by case-insensitive substring
	 * match against `label`.
	 */
	query: string;
	onSelect: (item: MentionItem, section: MentionSectionKind) => void;
	onClose: () => void;
	className?: string;
};

const SECTION_ORDER: MentionSectionKind[] = ["bots", "documents", "members"];

export function MentionPicker({
	sections,
	query,
	onSelect,
	onClose,
	className,
}: MentionPickerProps) {
	const t = useT();

	// Filter + flatten into a stable order for arrow-key traversal.
	const filtered = useMemo(() => {
		const lower = query.toLowerCase();
		const ordered: { section: MentionSection; items: MentionItem[] }[] = [];
		for (const kind of SECTION_ORDER) {
			const section = sections.find((s) => s.kind === kind);
			if (!section) continue;
			const items = section.items.filter((item) =>
				item.label.toLowerCase().includes(lower),
			);
			if (items.length > 0) ordered.push({ section, items });
		}
		return ordered;
	}, [sections, query]);

	const flat = useMemo(
		() => filtered.flatMap((f) => f.items.map((i) => ({ section: f.section.kind, item: i }))),
		[filtered],
	);

	const [activeIndex, setActiveIndex] = useState(0);
	useEffect(() => {
		// Reset when results change so the highlight stays in-bounds.
		setActiveIndex(0);
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((idx) => (flat.length === 0 ? 0 : (idx + 1) % flat.length));
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((idx) =>
					flat.length === 0 ? 0 : (idx - 1 + flat.length) % flat.length,
				);
			} else if (event.key === "Enter") {
				event.preventDefault();
				const current = flat[activeIndex];
				if (current) onSelect(current.item, current.section);
			} else if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [flat, activeIndex, onSelect, onClose]);

	const sectionLabel: Record<MentionSectionKind, string> = {
		bots: t({
			id: "mention-picker.section.bots",
			defaultMessage: "Bots",
		}),
		documents: t({
			id: "mention-picker.section.documents",
			defaultMessage: "Documents",
		}),
		members: t({
			id: "mention-picker.section.members",
			defaultMessage: "Members",
		}),
	};

	if (filtered.length === 0) {
		return (
			<div
				className={cn(
					"glass-panel shadow-elevated w-72 p-2 text-base-content/60 text-ui-sm",
					className,
				)}
			>
				{t({
					id: "mention-picker.empty",
					defaultMessage: "No matches",
				})}
			</div>
		);
	}

	let runningIndex = 0;
	return (
		<div
			className={cn(
				"glass-panel shadow-elevated w-72 flex flex-col gap-1 p-1",
				className,
			)}
			role="listbox"
		>
			{filtered.map(({ section, items }) => (
				<div className="flex flex-col gap-0.5" key={section.kind}>
					<div className="px-2 pt-1 text-base-content/50 text-ui-xs uppercase tracking-wide">
						{sectionLabel[section.kind]}
					</div>
					{items.map((item) => {
						const isActive = runningIndex === activeIndex;
						const ownIndex = runningIndex;
						runningIndex += 1;
						return (
							<button
								aria-selected={isActive}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm transition-colors",
									isActive
										? section.kind === "bots"
											? "bg-info/15 text-info"
											: "bg-base-200 text-base-content"
										: "hover:bg-base-200",
								)}
								key={item.id}
								onClick={() => onSelect(item, section.kind)}
								onMouseEnter={() => setActiveIndex(ownIndex)}
								role="option"
								type="button"
							>
								<span
									aria-hidden
									className={cn(
										"shrink-0",
										item.isBot ? "text-info" : "text-base-content/60",
									)}
								>
									{item.icon ?? (item.isBot ? <Cpu className="size-4" /> : null)}
								</span>
								<span className="min-w-0 flex-1 truncate">{item.label}</span>
								{item.meta ? (
									<span className="shrink-0 text-base-content/50 text-ui-xs">
										{item.meta}
									</span>
								) : null}
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}
