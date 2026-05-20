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
 * **Flush, not floating.** Earlier revisions wrapped each panel in a
 * rounded-lg card with its own border + shadow + `bg-base-100`, which
 * gave the right rail that "stack of post-it notes" look the user
 * called out as ugly. We don't do that anymore: panels render as flush
 * regions sharing the rail's surface, separated from each other by a
 * 1px hairline and from the world by the rail's own divider on the
 * resize handle. No rounded corners. No shadows. No nested card chrome.
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
				"flex min-h-0 flex-col overflow-hidden bg-base-100",
				className,
			)}
		>
			<header className="flex h-7 items-center gap-1 border-base-300 border-b px-2">
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
				<footer className="border-base-300 border-t bg-base-100 px-2 py-1 text-base-content/80 text-xs">
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
