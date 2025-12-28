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
						animate={{ opacity: 1 }}
						className="fixed inset-0 z-40 flex items-start justify-center bg-base-content/30 p-4 backdrop-blur"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					>
						<motion.div
							animate={{ opacity: 1, y: 0, scale: 1 }}
							className="glass-panel w-full max-w-2xl rounded-2xl p-3 shadow-2xl"
							exit={{ opacity: 0, y: 8, scale: 0.99 }}
							initial={{ opacity: 0, y: 10, scale: 0.99 }}
							onClick={(event) => event.stopPropagation()}
							transition={{ duration: 0.15, ease: "easeOut" }}
						>
							<div className="flex items-center gap-2 rounded-xl bg-base-200 px-3 py-2">
								<Search className="text-base-content/60" size={16} />
								<input
									autoFocus
									className="h-9 flex-1 bg-transparent text-sm outline-none"
									onChange={(event) => setQuery(event.target.value)}
									placeholder={placeholder}
									value={query}
								/>
								<span className="text-[10px] text-base-content/50 uppercase">
									Esc
								</span>
							</div>

							<div className="mt-3 max-h-80 overflow-auto pr-1">
								{grouped.map(([group, list]) => (
									<div className="mb-3 last:mb-0" key={group}>
										<div className="px-2 pb-1 font-semibold text-[11px] text-base-content/50 uppercase">
											{group}
										</div>
										<div className="flex flex-col gap-1">
											{list.map((item) => (
												<button
													className="flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-base-200"
													key={item.id}
													onClick={() => {
														item.onSelect?.();
														onClose?.();
													}}
													type="button"
												>
													<span className="grid h-9 w-9 place-items-center rounded-lg bg-base-300/60 text-base-content/80">
														{item.icon ?? <Search size={14} />}
													</span>
													<div className="flex-1">
														<div className="font-semibold text-sm">
															{item.title}
														</div>
														{item.subtitle ? (
															<div className="text-base-content/60 text-xs">
																{item.subtitle}
															</div>
														) : null}
													</div>
													{item.shortcut ? (
														<span className="text-[11px] text-base-content/60">
															{item.shortcut}
														</span>
													) : null}
												</button>
											))}
										</div>
									</div>
								))}
								{filtered.length === 0 ? (
									<div className="flex h-24 items-center justify-center text-base-content/60 text-sm">
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
