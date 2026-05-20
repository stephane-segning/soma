/**
 * PanelContainer — the right-area host that lays panels into stable
 * positions across two side-by-side columns.
 *
 * Locked by [PRD §3](../../../../../docs/src/architecture/prd/ui-revamp-v0.md)
 * and [refs main §1](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md).
 *
 * **Layout policy (locked by user testing after rounds 3–6):**
 *
 * Each panel has a stable position determined by its index in the
 * `panels` prop. Odd-indexed panels (1st, 3rd, 5th, …) stack in the
 * left column; even-indexed panels (2nd, 4th, 6th, …) stack in the
 * right column. Each column independently flex-cols its expanded
 * panels:
 *
 *   - 1 panel in a column → it takes 100 % of the column height.
 *   - 2 panels in a column → 50 / 50 split, etc.
 *
 * Truly-collapsed panels render as icons in a thin right rail (the
 * "strip"). Clicking an icon expands the panel back into its assigned
 * column slot. There is **no cap**, **no overflow**, and **no auto-
 * eviction** — every open panel renders in its assigned position, so
 * the user always knows where a given panel will appear.
 *
 * The container is otherwise presentational: caller owns `panels` and
 * `collapsedIds`. Earlier revisions used a maxExpanded cap with
 * various auto-evict policies — those were removed because the user
 * couldn't predict which panel would show up where.
 */
import { type ReactNode } from "react";
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

	// Split panels by parity of their declaration index — index 0 → col 1
	// ("odd position" = first/3rd/5th panel in 1-based user-facing terms),
	// index 1 → col 2. Each column then keeps only the panels that are
	// not collapsed. Collapsed panels go to the strip.
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

	// Each column is a fixed 20rem (320px) wide. The container's total
	// width grows naturally with the number of visible columns — 1
	// column = 20rem, 2 columns = ~40rem + the gap. Fixed-per-column
	// is what gives every panel the same readable width regardless of
	// how many other panels are open, which is the contract the user
	// asked for. Callers who want a flexible-width column can drop
	// `w-80` via className override on the columns slot, but the
	// default favours legibility over filling space.
	const renderColumn = (column: PanelDescriptor[]) => (
		<div className="flex min-h-0 w-80 shrink-0 flex-col gap-2">
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
			{/* Two-column grid of floating panel cards. When no panel is
			    expanded the entire grid collapses so only the right rail
			    (collapsed strip) is visible. Each column is independent —
			    a column with 1 panel fills its height entirely; with 2 it
			    splits 50/50, etc. */}
			{expandedCount > 0 ? (
				<div className="flex min-h-0 gap-2 p-2">
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
					// The rail itself has no border — it's just a column of
					// icon buttons sitting in transparent space. The floating
					// cards on the left supply all the visual structure.
					className="flex w-9 shrink-0 flex-col items-center gap-1 bg-transparent py-2"
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
							className="grid size-7 place-items-center rounded-md text-base-content/70 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							key={panel.id}
							onClick={
								onToggleCollapse
									? () => onToggleCollapse(panel.id)
									: undefined
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
