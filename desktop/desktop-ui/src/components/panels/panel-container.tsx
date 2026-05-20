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
 * edge of the container, sharing the same surface as the columns.
 * Clicking an icon expands the panel back into its assigned slot.
 *
 * **Flush layout, not floating cards.** The earlier revision rendered
 * each panel as a rounded card with `gap-2 p-2` between them, which
 * left visible whitespace gutters around every panel — the "floating"
 * look the user called out. This revision drops the gaps and the card
 * chrome: panels share the rail's surface; the only visible structure
 * between them is a 1px hairline (`divide-x` between columns,
 * `border-b` between stacked panels in `Panel`).
 *
 * There is no cap, no overflow, no auto-eviction. Every open panel
 * renders in its assigned position.
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

	// Each column is a fixed 18rem (288px) wide. The container's total
	// width grows naturally with the number of visible columns. Within
	// a column, stacked panels are separated by the header's own
	// `border-b` (so the seam between panels is a single hairline,
	// continuous with every other divider in the shell).
	const renderColumn = (column: PanelDescriptor[]) => (
		<div className="flex min-h-0 w-72 shrink-0 flex-col">
			{column.map((panel, index) => (
				<Panel
					actions={panel.actions}
					className={cn(
						"min-h-0 flex-1",
						// Hairline between stacked panels. The first panel in the
						// column already sits flush against the shell's top divider,
						// so we only add the top border on subsequent panels.
						index > 0 && "border-base-300 border-t",
					)}
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
			className={cn("flex min-h-0 w-full bg-base-100", className)}
		>
			{expandedCount > 0 ? (
				// Each visible column is separated from its neighbour by a 1px
				// hairline (`divide-x`), matching the shell's resize-handle
				// divider weight so the right rail reads as a single surface.
				<div className="flex min-h-0 flex-1 divide-x divide-base-300">
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
					// The strip shares the rail surface (no separate background)
					// and is divided from the columns by the same hairline.
					className={cn(
						"flex w-8 shrink-0 flex-col items-center gap-0.5 bg-base-100 py-1",
						expandedCount > 0 && "border-base-300 border-l",
					)}
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
							className="grid size-6 place-items-center rounded text-base-content/60 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
