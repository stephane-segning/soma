/**
 * Panel — one slot inside the right-area panel stack.
 *
 * Locked by [PRD §3](../../../../../docs/src/architecture/prd/ui-revamp-v0.md)
 * and [refs main §2](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md).
 *
 * Layout: header (title + actions) → body → optional footer. Panels
 * are uniform in chrome so chat, history, sub-pages, agenda, etc. all
 * read as siblings.
 *
 * **Floating-card chrome.** Each panel renders as its own rounded
 * card with a 1px border and a soft shadow. This is the contract the
 * user explicitly asked for: the per-panel separation has to read at
 * a glance, even before the user reads any label. A previous revision
 * tried collapsing panels into a flush surface with hairlines — that
 * was reverted because the seam between panels got lost on busy rails.
 *
 * The left sidebar (Pages) uses the **same** chrome so the whole shell
 * reads as a row of consistent floating panels.
 *
 * Collapse → the parent `PanelContainer` renders an icon strip on the
 * right edge; the Panel itself is not visible in collapsed state. This
 * component handles the **expanded** rendering only.
 */
import type { ReactNode } from "react";
import { Minus, X } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type PanelProps = {
	title: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	/** Extra actions rendered to the right of the title (icon buttons). */
	actions?: ReactNode;
	/** Collapse the panel to the icon strip. */
	onCollapse?: () => void;
	/** Detach / dismiss the panel from the container. */
	onClose?: () => void;
	className?: string;
};

export function Panel({
	title,
	children,
	footer,
	actions,
	onCollapse,
	onClose,
	className,
}: PanelProps) {
	const t = useT();
	return (
		<section
			className={cn(
				// Floating-card layout: rounded edges, a soft shadow that gives
				// a sense of depth without competing with the editor.
				"flex min-h-0 flex-col overflow-hidden rounded-lg border border-base-300/70 bg-base-100 shadow-sm",
				className,
			)}
		>
			<header className="flex h-8 items-center gap-1 border-base-300 border-b px-2">
				<h2 className="min-w-0 flex-1 truncate font-medium text-[11px] text-base-content/70 uppercase tracking-wide">
					{title}
				</h2>
				{actions ? (
					<div className="flex shrink-0 items-center gap-0.5">{actions}</div>
				) : null}
				{onCollapse ? (
					<HeaderIconButton
						aria-label={t({
							id: "panel.collapse",
							defaultMessage: "Collapse panel",
						})}
						onClick={onCollapse}
					>
						<Minus aria-hidden className="size-3" />
					</HeaderIconButton>
				) : null}
				{onClose ? (
					<HeaderIconButton
						aria-label={t({
							id: "panel.close",
							defaultMessage: "Close panel",
						})}
						onClick={onClose}
					>
						<X aria-hidden className="size-3" />
					</HeaderIconButton>
				) : null}
			</header>
			<div className="min-h-0 flex-1 overflow-auto">{children}</div>
			{footer ? (
				<footer className="border-base-300 border-t bg-base-100 px-2 py-1 text-xs text-base-content/80">
					{footer}
				</footer>
			) : null}
		</section>
	);
}

function HeaderIconButton({
	"aria-label": ariaLabel,
	onClick,
	children,
}: {
	"aria-label": string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			aria-label={ariaLabel}
			className="grid size-5 shrink-0 place-items-center rounded text-base-content/50 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
			onClick={onClick}
			title={ariaLabel}
			type="button"
		>
			{children}
		</button>
	);
}
