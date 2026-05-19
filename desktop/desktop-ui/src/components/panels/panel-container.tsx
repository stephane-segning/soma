/**
 * PanelContainer — the right-area host that stacks panels and exposes
 * a collapsed-icon strip on the right edge.
 *
 * Locked by [PRD §3](../../../../../docs/src/architecture/prd/ui-revamp-v0.md)
 * and [refs main §1](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md).
 *
 * The container is **presentational**: caller owns the list of panels
 * + which are collapsed. Panels stack vertically; collapsed panels
 * render as a vertical icon strip on the right edge so the user can
 * expand them with one click without losing them in a menu.
 *
 * Drag-to-split is **not** in v0 (see scaffold §8 open question 3 —
 * keyboard-only split target for v0.1). The `columns` prop exists
 * so callers can pre-arrange a horizontal split if needed; for v0
 * we render only the first column (single vertical stack) and any
 * additional columns join the stack.
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

	const expanded = panels.filter((panel) => !collapsedSet.has(panel.id));
	const collapsed = panels.filter((panel) => collapsedSet.has(panel.id));

	return (
		<div
			aria-label={t({
				id: "panel-container.aria-label",
				defaultMessage: "Side panels",
			})}
			className={cn("flex min-h-0 w-full bg-transparent", className)}
		>
			{/* Expanded panels render as a column of floating cards. When no
			    panel is expanded we drop the whole left area so the right
			    rail (collapsed strip) sits flush against the editor — no
			    empty placeholder taking up space. */}
			{expanded.length > 0 ? (
				<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
					{expanded.map((panel) => (
						<Panel
							actions={panel.actions}
							footer={panel.footer}
							key={panel.id}
							onClose={
								onClosePanel ? () => onClosePanel(panel.id) : undefined
							}
							onCollapse={
								onToggleCollapse
									? () => onToggleCollapse(panel.id)
									: undefined
							}
							title={panel.title}
						>
							{panel.content}
						</Panel>
					))}
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
							className="grid size-7 place-items-center rounded-md text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
