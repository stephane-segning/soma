/**
 * PanelContainer — the right-area host that lays panels into stable
 * positions across two side-by-side columns.
 *
 * Locked by [PRD §3](../../../../../docs/src/architecture/prd/ui-revamp-v0.md)
 * and [refs main §1](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md).
 *
 * **Layout policy (locked by user testing):**
 *
 * Each panel has a stable position determined by its index in the
 * `panels` prop. Odd-indexed panels (1st, 3rd, 5th …) stack in the
 * first column; even-indexed (2nd, 4th, …) in the second. Each column
 * independently flex-cols its expanded panels:
 *
 *   - 1 panel in a column → 100 % of column height.
 *   - 2 panels in a column → 50 / 50 split, etc.
 *
 * Truly-collapsed panels render as icons in a thin strip on the right
 * edge of the container. Clicking an icon expands the panel back into
 * its assigned slot.
 *
 * **Floating-card aesthetic.** Each panel renders as its own rounded
 * card (chrome lives in `Panel`); the container provides a `p-2 gap-2`
 * gutter so the cards visibly separate. The user explicitly asked for
 * this — a flush-hairline alternative was tried and reverted because
 * the seam between panels got lost on busy rails. The left sidebar
 * in the SomaApp story uses the same Panel chrome so the whole shell
 * reads as a coherent row of floating cards.
 *
 * **Strip pinning.** The icon strip sits in its own `shrink-0` column
 * and the columns container uses `min-w-0 overflow-x-auto`, so when
 * the rail is narrowed past the columns' natural width the *columns*
 * scroll horizontally — the strip stays visible at the right edge.
 * Before this, narrowing the rail pushed the strip off-screen, which
 * was the second half of the bug the user reported.
 *
 * There is no cap, no overflow eviction. Every open panel renders in
 * its assigned position.
 */
import type { ReactNode } from "react";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { Panel } from "./panel";

export type PanelDescriptor = {
	id: string;
	title: ReactNode;
	/** Icon shown when the panel is collapsed to the strip. */
	icon: ReactNode;
	/** Header actions (rendered to the right of the title). */
	actions?: ReactNode;
	/** The panel body. Rendered inside a scroll container. */
	content: ReactNode;
	footer?: ReactNode;
};

export type PanelContainerProps = {
	panels: PanelDescriptor[];
	/** Set of panel ids currently collapsed to the icon strip. */
	collapsedIds?: ReadonlySet<string> | readonly string[];
	onToggleCollapse?: (id: string) => void;
	onClosePanel?: (id: string) => void;
	className?: string;
};

export function PanelContainer({
	panels,
	collapsedIds,
	onToggleCollapse,
	onClosePanel,
	className,
}: PanelContainerProps) {
	const t = useT();
	const collapsedSet =
		collapsedIds instanceof Set
			? collapsedIds
			: new Set<string>(collapsedIds ?? []);

	const columnOne: PanelDescriptor[] = [];
	const columnTwo: PanelDescriptor[] = [];
	const collapsed: PanelDescriptor[] = [];
	panels.forEach((panel, index) => {
		if (collapsedSet.has(panel.id)) {
			collapsed.push(panel);
			return;
		}
		if (index % 2 === 0) columnOne.push(panel);
		else columnTwo.push(panel);
	});

	const expandedCount = columnOne.length + columnTwo.length;

	// Each column is a fixed 18rem (288px) wide. When the rail is wider
	// than the columns need, they sit at natural width with a gap. When
	// the rail is narrower, the columns container scrolls horizontally
	// inside its `min-w-0 overflow-x-auto` shell so the strip never
	// disappears off the right edge.
	const renderColumn = (column: PanelDescriptor[]) => (
		<div className="flex min-h-0 w-72 shrink-0 flex-col gap-2">
			{column.map((panel) => (
				<Panel
					actions={panel.actions}
					className="min-h-0 flex-1"
					footer={panel.footer}
					key={panel.id}
					onClose={onClosePanel ? () => onClosePanel(panel.id) : undefined}
					onCollapse={
						onToggleCollapse ? () => onToggleCollapse(panel.id) : undefined
					}
					title={panel.title}
				>
					{panel.content}
				</Panel>
			))}
		</div>
	);

	return (
		<div
			aria-label={t({
				id: "panel-container.aria-label",
				defaultMessage: "Side panels",
			})}
			className={cn("flex min-h-0 w-full bg-transparent", className)}
		>
			{/* Columns container takes the remaining width and scrolls
			    horizontally if the rail is narrower than the natural column
			    width. `min-w-0` is what unlocks the scroll: a flex item
			    defaults to `min-width: auto` which would push its content
			    out and overflow the parent. */}
			{expandedCount > 0 ? (
				<div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-x-auto p-2">
					{columnOne.length > 0 ? renderColumn(columnOne) : null}
					{columnTwo.length > 0 ? renderColumn(columnTwo) : null}
				</div>
			) : null}
			{collapsed.length > 0 ? (
				<aside
					aria-label={t({
						id: "panel-container.collapsed-strip",
						defaultMessage: "Collapsed panels",
					})}
					// `shrink-0` keeps the strip visible no matter how narrow the
					// rail gets — the columns area absorbs the squeeze instead.
					className="flex w-8 shrink-0 flex-col items-center gap-1 py-2"
				>
					{collapsed.map((panel) => (
						<button
							aria-label={
								typeof panel.title === "string"
									? panel.title
									: t({
											id: "panel-container.expand",
											defaultMessage: "Expand panel",
										})
							}
							className="grid size-7 place-items-center rounded text-base-content/60 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							key={panel.id}
							onClick={
								onToggleCollapse ? () => onToggleCollapse(panel.id) : undefined
							}
							title={typeof panel.title === "string" ? panel.title : undefined}
							type="button"
						>
							{panel.icon}
						</button>
					))}
				</aside>
			) : null}
		</div>
	);
}
