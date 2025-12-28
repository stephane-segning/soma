import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Search } from "react-feather";
import { useHotkeys } from "react-hotkeys-hook";
import { OverlayPortal } from "./overlay-portal";

export type CommandPaletteItem = {
	id: string;
	title: string;
	subtitle?: string;
	shortcut?: string;
	icon?: React.ReactNode;
	group?: string;
	onSelect?: () => void;
};

export type CommandPaletteProps = {
	open: boolean;
	items: CommandPaletteItem[];
	onClose?: () => void;
	onOpen?: () => void;
	placeholder?: string;
	hotkey?: string;
};

export function CommandPalette({
	open,
	items,
	onClose,
	onOpen,
	placeholder = "Search commands…",
	hotkey = "mod+k",
}: CommandPaletteProps) {
	const [query, setQuery] = useState("");

	useHotkeys(
		hotkey,
		(event) => {
			event.preventDefault();
			if (open) {
				onClose?.();
			} else {
				onOpen?.();
			}
		},
		{ enabled: true },
		[open, onClose, onOpen, hotkey],
	);

	useHotkeys(
		"esc",
		(event) => {
			event.preventDefault();
			onClose?.();
		},
		{ enabled: open },
		[open, onClose],
	);

	const filtered = useMemo(() => {
		if (!query) return items;
		const lower = query.toLowerCase();
		return items.filter(
			(item) =>
				item.title.toLowerCase().includes(lower) ||
				item.subtitle?.toLowerCase().includes(lower) ||
				item.group?.toLowerCase().includes(lower),
		);
	}, [items, query]);

	const grouped = useMemo(() => {
		const groups = new Map<string, CommandPaletteItem[]>();
		for (const item of filtered) {
			const key = item.group ?? "Commands";
			const list = groups.get(key) ?? [];
			list.push(item);
			groups.set(key, list);
		}
		return Array.from(groups.entries());
	}, [filtered]);

	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-40 flex items-start justify-center bg-base-content/30 p-4 backdrop-blur"
						onClick={onClose}
					>
						<motion.div
							initial={{ opacity: 0, y: 10, scale: 0.99 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 8, scale: 0.99 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							onClick={(event) => event.stopPropagation()}
							className="glass-panel w-full max-w-2xl rounded-2xl p-3 shadow-2xl"
						>
							<div className="flex items-center gap-2 rounded-xl bg-base-200 px-3 py-2">
								<Search size={16} className="text-base-content/60" />
								<input
									autoFocus
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder={placeholder}
									className="h-9 flex-1 bg-transparent text-sm outline-none"
								/>
								<span className="text-[10px] uppercase text-base-content/50">Esc</span>
							</div>

							<div className="mt-3 max-h-80 overflow-auto pr-1">
								{grouped.map(([group, list]) => (
									<div key={group} className="mb-3 last:mb-0">
										<div className="px-2 pb-1 text-[11px] font-semibold uppercase text-base-content/50">
											{group}
										</div>
										<div className="flex flex-col gap-1">
											{list.map((item) => (
												<button
													key={item.id}
													type="button"
													className="flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-base-200"
													onClick={() => {
														item.onSelect?.();
														onClose?.();
													}}
												>
													<span className="grid h-9 w-9 place-items-center rounded-lg bg-base-300/60 text-base-content/80">
														{item.icon ?? <Search size={14} />}
													</span>
													<div className="flex-1">
														<div className="text-sm font-semibold">{item.title}</div>
														{item.subtitle ? (
															<div className="text-xs text-base-content/60">{item.subtitle}</div>
														) : null}
													</div>
													{item.shortcut ? (
														<span className="text-[11px] text-base-content/60">{item.shortcut}</span>
													) : null}
												</button>
											))}
										</div>
									</div>
								))}
								{filtered.length === 0 ? (
									<div className="flex h-24 items-center justify-center text-sm text-base-content/60">
										No commands found
									</div>
								) : null}
							</div>
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</OverlayPortal>
	);
}
