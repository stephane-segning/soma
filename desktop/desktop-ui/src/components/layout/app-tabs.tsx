/**
 * AppTabs — horizontal tab strip for documents / workspaces inside the
 * app. NOT OS window chrome.
 *
 * Renders a row of tabs at the top of the main column, in the same
 * spirit as browser or editor tabs (VS Code, Chrome). Each tab carries
 * an optional icon, a label, an optional dirty dot, and a close button
 * that becomes visible on hover. An optional `+` button at the end
 * fires `onNew`.
 *
 * Motion contract:
 * - Active indicator slides between tabs via `layoutId`.
 * - Tabs fade in / out via `AnimatePresence` when the inventory changes.
 * - Opacity-only — no scale or translate — to satisfy
 *   `no-scale-animations.test.ts` and to stay in lockstep with the rest
 *   of the overlay vocabulary.
 */
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Plus, X } from "react-feather";
import { cn } from "../../utils/cn";

export type AppTab = {
	id: string;
	title: string;
	/** Icon node (already sized — size-3.5 is the canonical caller). */
	icon?: ReactNode;
	/** Unsaved-changes dot. Shows a 6px circle to the left of close. */
	dirty?: boolean;
};

export type AppTabsProps = {
	tabs: ReadonlyArray<AppTab>;
	activeId?: string;
	onSelect?: (id: string) => void;
	onClose?: (id: string) => void;
	/** When set, renders a `+` button at the trailing edge of the strip. */
	onNew?: () => void;
	className?: string;
	"aria-label"?: string;
};

export function AppTabs({
	tabs,
	activeId,
	onSelect,
	onClose,
	onNew,
	className,
	"aria-label": ariaLabel = "Tabs",
}: AppTabsProps) {
	return (
		<div
			aria-label={ariaLabel}
			className={cn(
				"flex items-center gap-1 border-base-300 border-b bg-base-100 px-2 pt-1",
				className,
			)}
			role="tablist"
		>
			<div className="scrollbar-none flex flex-1 items-center gap-0.5 overflow-x-auto">
				<AnimatePresence initial={false}>
					{tabs.map((tab) => {
						const active = tab.id === activeId;
						return (
							<motion.div
								animate={{ opacity: 1 }}
								className="relative flex shrink-0 items-stretch"
								exit={{ opacity: 0 }}
								initial={{ opacity: 0 }}
								key={tab.id}
								layout
								transition={{ duration: 0.15, ease: "easeOut" }}
							>
								<button
									aria-selected={active}
									className={cn(
										"group/tab flex h-8 max-w-48 items-center gap-1.5 rounded-t-md px-2.5 text-sm",
										// No `transition-colors` — snap the active highlight to
										// stay consistent with MenuShell / CommandPalette.
										active
											? "bg-base-100 text-base-content"
											: "text-base-content/60 hover:bg-base-200/60 hover:text-base-content",
									)}
									onClick={() => onSelect?.(tab.id)}
									role="tab"
									tabIndex={active ? 0 : -1}
									type="button"
								>
									{tab.icon ? (
										<span aria-hidden className="shrink-0">
											{tab.icon}
										</span>
									) : null}
									<span className="min-w-0 truncate">{tab.title}</span>
									{tab.dirty ? (
										<span
											aria-label="Unsaved changes"
											className="size-1.5 shrink-0 rounded-full bg-primary"
										/>
									) : null}
									{onClose ? (
										// Close button — visible on hover of the tab, always
										// visible when the tab is active. `as="span"` because we
										// can't nest <button> inside <button>; we handle the
										// click via stopPropagation on the parent button.
										<span
											aria-label={`Close ${tab.title}`}
											className={cn(
												"grid size-4 shrink-0 place-items-center rounded text-base-content/50 hover:bg-base-300 hover:text-base-content",
												active
													? "opacity-100"
													: "opacity-0 group-hover/tab:opacity-100",
											)}
											onClick={(event) => {
												event.stopPropagation();
												onClose(tab.id);
											}}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													event.stopPropagation();
													onClose(tab.id);
												}
											}}
											role="button"
											tabIndex={active ? 0 : -1}
										>
											<X aria-hidden className="size-3" />
										</span>
									) : null}
								</button>
								{/*
								 * Active indicator. Shared layoutId means motion slides this
								 * underline between tabs as the active id changes — that is
								 * the only "moving part" in the strip, kept deliberately
								 * subtle to match the rest of the surface vocabulary.
								 */}
								{active ? (
									<motion.span
										aria-hidden
										className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary"
										layoutId="app-tabs-active"
										transition={{ duration: 0.18, ease: "easeOut" }}
									/>
								) : null}
							</motion.div>
						);
					})}
				</AnimatePresence>
			</div>
			{onNew ? (
				<button
					aria-label="New tab"
					className="grid size-7 shrink-0 place-items-center rounded-md text-base-content/60 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
					onClick={onNew}
					type="button"
				>
					<Plus aria-hidden className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
