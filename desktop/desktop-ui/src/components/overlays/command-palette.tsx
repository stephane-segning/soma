/**
 * CommandPalette — cross-cutting ⌘K modal for jumping anywhere in the
 * app and running commands.
 *
 * Locked by [ADR-0005 §12](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and [refs space-lifecycle §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-space-lifecycle.md).
 *
 * Sections in fixed priority order:
 *   1. Recent docs (any space)
 *   2. Spaces
 *   3. Documents
 *   4. Commands
 *
 * Same chip-strip footer as TreePopover so the two surfaces feel
 * sibling, not separate.
 */
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "react-feather";
import { useHotkeys } from "react-hotkeys-hook";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { Kbd } from "../primitives/kbd";
import { OverlayPortal } from "./overlay-portal";

export type CommandPaletteSectionKind =
	| "recent-docs"
	| "spaces"
	| "documents"
	| "commands";

export type CommandPaletteItem = {
	id: string;
	title: string;
	/** Single-line secondary text (e.g. space name, doc path, command group). */
	subtitle?: string;
	/** Keyboard shortcut hint shown right-aligned (display only). */
	shortcut?: string;
	icon?: ReactNode;
	section: CommandPaletteSectionKind;
	onSelect: () => void;
};

export type CommandPaletteProps = {
	open: boolean;
	items: CommandPaletteItem[];
	onClose: () => void;
	onOpen?: () => void;
	placeholder?: string;
	hotkey?: string;
	/**
	 * Notified on every keystroke in the search input. Use this to pipe
	 * the query into an external search service whose results you feed
	 * back via `items`. Independent of the built-in client-side filter,
	 * which always runs against the current `items`.
	 */
	onQueryChange?: (query: string) => void;
};

const SECTION_ORDER: CommandPaletteSectionKind[] = [
	"recent-docs",
	"spaces",
	"documents",
	"commands",
];

export function CommandPalette({
	open,
	items,
	onClose,
	onOpen,
	placeholder,
	hotkey = "mod+k",
	onQueryChange,
}: CommandPaletteProps) {
	const t = useT();
	const [query, setQuery] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);

	useHotkeys(
		hotkey,
		(event) => {
			event.preventDefault();
			if (open) {
				onClose();
			} else {
				onOpen?.();
			}
		},
		{ enabled: true, enableOnFormTags: true },
		[open, onClose, onOpen, hotkey],
	);

	useHotkeys(
		"esc",
		(event) => {
			event.preventDefault();
			onClose();
		},
		{ enabled: open, enableOnFormTags: true },
		[open, onClose],
	);

	// Reset the filter when the palette opens so consecutive opens
	// don't surface stale query state. `onQueryChange` is read via a
	// ref so a caller passing an inline arrow function doesn't cause
	// this effect to re-fire mid-typing and wipe the user's input.
	const onQueryChangeRef = useRef(onQueryChange);
	useEffect(() => {
		onQueryChangeRef.current = onQueryChange;
	}, [onQueryChange]);
	useEffect(() => {
		if (open) {
			setQuery("");
			onQueryChangeRef.current?.("");
		}
	}, [open]);

	const sectionLabel = useMemo<Record<CommandPaletteSectionKind, string>>(
		() => ({
			"recent-docs": t({
				id: "command-palette.section.recent-docs",
				defaultMessage: "Recent",
			}),
			spaces: t({
				id: "command-palette.section.spaces",
				defaultMessage: "Spaces",
			}),
			documents: t({
				id: "command-palette.section.documents",
				defaultMessage: "Documents",
			}),
			commands: t({
				id: "command-palette.section.commands",
				defaultMessage: "Commands",
			}),
		}),
		[t],
	);

	const grouped = useMemo(() => {
		const lower = query.toLowerCase();
		const matches = items.filter((item) => {
			if (lower.length === 0) return true;
			return (
				item.title.toLowerCase().includes(lower) ||
				item.subtitle?.toLowerCase().includes(lower) ||
				// Restored from the pre-refactor behavior: typing "recent" /
				// "commands" / "spaces" / "documents" filters by section.
				sectionLabel[item.section].toLowerCase().includes(lower)
			);
		});
		const buckets = new Map<CommandPaletteSectionKind, CommandPaletteItem[]>();
		for (const section of SECTION_ORDER) buckets.set(section, []);
		for (const item of matches) buckets.get(item.section)?.push(item);
		return SECTION_ORDER.map((section) => ({
			section,
			items: buckets.get(section) ?? [],
		})).filter((g) => g.items.length > 0);
	}, [items, query, sectionLabel]);

	const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

	const [activeIndex, setActiveIndex] = useState(0);
	useEffect(() => {
		setActiveIndex(0);
	}, [flat]);

	// Avoid re-binding the global keydown listener on every keystroke /
	// selection change. The listener attaches once when `open` flips
	// true and reads the latest `flat` / `activeIndex` via refs.
	const flatRef = useRef(flat);
	const activeIndexRef = useRef(activeIndex);
	useEffect(() => {
		flatRef.current = flat;
	}, [flat]);
	useEffect(() => {
		activeIndexRef.current = activeIndex;
	}, [activeIndex]);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			// Only respond when the focus is within this palette instance.
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (!containerRef.current?.contains(target)) return;
			const currentFlat = flatRef.current;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((idx) =>
					currentFlat.length === 0 ? 0 : (idx + 1) % currentFlat.length,
				);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((idx) =>
					currentFlat.length === 0
						? 0
						: (idx - 1 + currentFlat.length) % currentFlat.length,
				);
			} else if (event.key === "Enter") {
				event.preventDefault();
				if (currentFlat.length > 0) {
					currentFlat[activeIndexRef.current]?.onSelect();
					onClose();
				}
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	let runningIndex = 0;
	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 z-40 flex items-start justify-center bg-base-content/30 p-4 backdrop-blur"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					>
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							aria-label={t({
								id: "command-palette.aria-label",
								defaultMessage: "Command palette",
							})}
							aria-modal="true"
							className="glass-panel shadow-elevated w-full max-w-2xl p-2"
							exit={{ opacity: 0, y: 8 }}
							initial={{ opacity: 0, y: 10 }}
							onClick={(event) => event.stopPropagation()}
							ref={containerRef}
							role="dialog"
							transition={{ duration: 0.15, ease: "easeOut" }}
						>
							<div className="flex items-center gap-2 rounded-md bg-base-200 px-2 py-1.5">
								<Search
									aria-hidden
									className="size-4 shrink-0 text-base-content/60"
								/>
								<input
									autoFocus
									className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/40"
									onChange={(event) => {
										setQuery(event.target.value);
										onQueryChange?.(event.target.value);
									}}
									placeholder={
										placeholder ??
										t({
											id: "command-palette.placeholder",
											defaultMessage: "Search docs, spaces, commands…",
										})
									}
									type="text"
									value={query}
								/>
							</div>

							<div className="mt-2 flex max-h-96 flex-col gap-1 overflow-y-auto">
								{grouped.map((group) => (
									<div className="flex flex-col gap-0.5" key={group.section}>
										<div className="px-2 pt-1 text-base-content/50 text-xs uppercase tracking-wide">
											{sectionLabel[group.section]}
										</div>
										{group.items.map((item) => {
											const isActive = runningIndex === activeIndex;
											const ownIndex = runningIndex;
											runningIndex += 1;
											return (
												<button
													aria-selected={isActive}
													className={cn(
														// No `transition-colors` — snap the highlight; matches MenuShell/BackendSwitcher.
														"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
														isActive
															? "bg-base-200 text-base-content"
															: "hover:bg-base-200",
													)}
													key={item.id}
													onClick={() => {
														item.onSelect();
														onClose();
													}}
													onMouseEnter={() => setActiveIndex(ownIndex)}
													role="option"
													type="button"
												>
													<span
														aria-hidden
														className="shrink-0 text-base-content/60"
													>
														{item.icon ?? <Search className="size-3.5" />}
													</span>
													<span className="flex min-w-0 flex-1 flex-col">
														<span className="truncate">{item.title}</span>
														{item.subtitle ? (
															<span className="truncate text-base-content/60 text-xs">
																{item.subtitle}
															</span>
														) : null}
													</span>
													{item.shortcut ? (
														<Kbd className="shrink-0" size="xs">
															{item.shortcut}
														</Kbd>
													) : null}
												</button>
											);
										})}
									</div>
								))}
								{flat.length === 0 ? (
									<div className="px-2 py-4 text-center text-base-content/60 text-sm">
										{t({
											id: "command-palette.empty",
											defaultMessage: "No matches",
										})}
									</div>
								) : null}
							</div>

							<KeyboardHintsFooter />
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</OverlayPortal>
	);
}

function KeyboardHintsFooter() {
	const t = useT();
	return (
		<div className="mt-2 flex flex-wrap items-center gap-1 border-base-300 border-t pt-2 text-base-content/50 text-xs">
			<HintChip
				keys="↑↓"
				label={t({
					id: "command-palette.hint.nav",
					defaultMessage: "Navigate",
				})}
			/>
			<HintChip
				keys="↵"
				label={t({
					id: "command-palette.hint.open",
					defaultMessage: "Open",
				})}
			/>
			<HintChip
				keys="Esc"
				label={t({
					id: "command-palette.hint.close",
					defaultMessage: "Close",
				})}
			/>
		</div>
	);
}

function HintChip({ keys, label }: { keys: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5 px-1.5 py-0.5">
			<Kbd size="xs">{keys}</Kbd>
			<span>{label}</span>
		</span>
	);
}
