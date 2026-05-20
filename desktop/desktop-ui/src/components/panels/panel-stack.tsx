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
 * rail decides. Earlier revisions baked `w-72` into each column and
 * that's exactly the constraint the user pushed back on ("Used
 * panelcontainer width should be 100%, not 400px"). Here, 100 % is
 * the rule: card width = rail width, always.
 *
 * **Vertical sizing.** Each card is `flex-1 min-h-0`, so N panels in
 * a stack split the available height evenly. If there's only one
 * card, it fills the rail.
 *
 * Returns `null` if `panels` is empty so callers can rely on
 * `<PanelStack panels={openPanels} />` collapsing cleanly without an
 * outer `panels.length > 0 &&` guard.
 */
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Panel } from "./panel";

export type PanelStackItem = {
	id: string;
	title: ReactNode;
	actions?: ReactNode;
	content: ReactNode;
	footer?: ReactNode;
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
			{panels.map((panel) => (
				<Panel
					actions={panel.actions}
					className="min-h-0 flex-1"
					footer={panel.footer}
					key={panel.id}
					onClose={onClose ? () => onClose(panel.id) : undefined}
					onCollapse={onCollapse ? () => onCollapse(panel.id) : undefined}
					title={panel.title}
				>
					{panel.content}
				</Panel>
			))}
		</div>
	);
}
