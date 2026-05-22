/**
 * PanelStack — a vertical, full-width stack of `Panel` cards.
 *
 * The "panels region" of a rail. The container is `w-full` so every
 * card takes the rail's width; cards are separated by a `gap-2`
 * gutter; the whole stack has a `p-2` outer margin so the cards
 * float on whatever surface the rail provides (the gray base-200
 * frame, in the SomaApp story).
 *
 * **Width contract.** PanelStack never imposes a column width — the
 * rail decides. Card width = rail width, always.
 *
 * **Vertical sizing.** Each card defaults to `flex-1 min-h-0`, so N
 * panels in a stack split the available height evenly. Cards that
 * pass `size: "content"` opt out of the flex split and shrink to
 * their natural content height — useful for short, fixed-row panels
 * (e.g. a 3-row static nav) sharing a rail with a flex-1 sibling
 * (e.g. a tall page tree) so the flex-1 sibling reclaims the void.
 *
 * **Motion contract.** Cards animate in / out on add / remove via
 * `AnimatePresence` (opacity-only, to match the rest of the overlay
 * vocab) and use motion's `layout` prop so existing cards smoothly
 * redistribute height when a sibling enters or leaves. No scale, no
 * y-translate — the layout animation does all the visible "moving
 * parts."
 *
 * Returns `null` if `panels` is empty so callers can rely on
 * `<PanelStack panels={openPanels} />` collapsing cleanly without an
 * outer `panels.length > 0 &&` guard.
 */
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Panel } from "./panel";

/** Tailwind classes per `size`. Hoisted so the JSX stays slim. */
const SIZE_CLASS = {
	fill: "min-h-0 flex-1",
	content: "min-h-0 flex-none",
} as const;

export type PanelStackItem = {
	id: string;
	title: ReactNode;
	actions?: ReactNode;
	content: ReactNode;
	footer?: ReactNode;
	/**
	 * Vertical sizing for this card.
	 *  - `"fill"` (default) — card takes a share of the available
	 *    height (`flex-1 min-h-0`).
	 *  - `"content"` — card shrinks to its natural content height
	 *    (`flex-none`). Other `"fill"` siblings split the remaining
	 *    space; if every sibling is `"content"`, the stack stacks
	 *    naturally and any leftover height stays empty.
	 */
	size?: "fill" | "content";
};

export type PanelStackProps = {
	panels: ReadonlyArray<PanelStackItem>;
	/** Renders the `−` collapse button on each panel header. */
	onCollapse?: (id: string) => void;
	/** Renders the `×` close button on each panel header. */
	onClose?: (id: string) => void;
	className?: string;
};

export function PanelStack({
	panels,
	onCollapse,
	onClose,
	className,
}: PanelStackProps) {
	if (panels.length === 0) return null;
	return (
		<div className={cn("flex h-full min-h-0 flex-col gap-2 p-2", className)}>
			<AnimatePresence initial={false}>
				{panels.map((panel) => (
					<motion.div
						animate={{ opacity: 1 }}
						className={SIZE_CLASS[panel.size ?? "fill"]}
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						key={panel.id}
						layout
						transition={{ duration: 0.18, ease: "easeOut" }}
					>
						<Panel
							actions={panel.actions}
							className={panel.size === "content" ? undefined : "h-full"}
							footer={panel.footer}
							onClose={onClose ? () => onClose(panel.id) : undefined}
							onCollapse={onCollapse ? () => onCollapse(panel.id) : undefined}
							title={panel.title}
						>
							{panel.content}
						</Panel>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
