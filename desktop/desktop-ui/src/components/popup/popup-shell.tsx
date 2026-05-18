/**
 * PopupShell — reusable chrome for focus-task popup windows.
 *
 * Locked by [ADR-0005 §10](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and [refs popup-window §2](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-popup-window.md).
 *
 * v0 hosts the 10-finger typing exercise; future focus tasks (exams,
 * surveys) reuse the same shell. The popup is its own `BrowserWindow`
 * routed by `#/popup/<task>/<id>`; the React component here renders
 * the chrome + body, not the window itself.
 *
 * Chrome layout (28px drag strip + body):
 *   ┌──────────────────────────────────────┐
 *   │ <title>           📌 ↺ ⤴ ✕           │  drag strip (28px)
 *   ├──────────────────────────────────────┤  1px progress bar (opt.)
 *   │                                      │
 *   │             <children>               │  body
 *   │                                      │
 *   └──────────────────────────────────────┘
 *
 * Glyph cluster (right-flush): **pin · restart · return-to-main · close**.
 * Pin defaults off; per-window; no global setting.
 * Return-to-main closes the popup, focuses the main window, and leaves
 * the task's state untouched so the user can resume it.
 *
 * The drag region uses `data-drag-region` (Electron's frameless-window
 * convention from desktop/soma/src/renderer/src/styles/app.scss) and
 * the glyph cluster carries `data-no-drag` so the buttons are
 * clickable through the drag region.
 */
import { type ReactNode } from "react";
import { CornerUpLeft, RotateCcw, X } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type PopupShellProps = {
	/**
	 * Visible title in the drag strip. The same value should be set as
	 * the OS window title (e.g. `BrowserWindow.setTitle(title)`) so the
	 * popup is identifiable in the dock / Mission Control / window
	 * switcher — locked by refs popup-window §6.
	 */
	title: string;
	/** Always-on-top toggle state. Controlled. Default off per ADR §10. */
	pinned?: boolean;
	onTogglePin?: () => void;
	onRestart?: () => void;
	/**
	 * Closes the popup but leaves task state intact and focuses the main
	 * window. Distinct from `onClose`, which dismisses entirely. The
	 * fourth glyph in the cluster — locked from refs popup-window §6
	 * "Surprising find" on browser-PiP's back-to-tab pattern.
	 */
	onReturnToMain?: () => void;
	onClose: () => void;
	/** Optional 0-100 progress value rendered as a 1px bar under the strip. */
	progress?: number;
	children: ReactNode;
	className?: string;
};

export function PopupShell({
	title,
	pinned,
	onTogglePin,
	onRestart,
	onReturnToMain,
	onClose,
	progress,
	children,
	className,
}: PopupShellProps) {
	const t = useT();
	return (
		<div
			className={cn(
				"flex h-full min-h-0 w-full flex-col overflow-hidden bg-base-100",
				className,
			)}
		>
			<header
				className="flex h-7 shrink-0 items-center justify-between gap-2 border-base-300 border-b bg-base-100 px-2"
				data-drag-region
			>
				<div className="min-w-0 flex-1 truncate text-base-content/80 text-ui-xs">
					{title}
				</div>
				<div className="flex shrink-0 items-center gap-0.5" data-no-drag>
					{onTogglePin ? (
						<GlyphButton
							active={pinned}
							label={
								pinned
									? t({
											id: "popup-shell.unpin",
											defaultMessage: "Unpin from top",
										})
									: t({
											id: "popup-shell.pin",
											defaultMessage: "Keep on top",
										})
							}
							onClick={onTogglePin}
						>
							<PinIcon className="size-3.5" pinned={pinned} />
						</GlyphButton>
					) : null}
					{onRestart ? (
						<GlyphButton
							label={t({
								id: "popup-shell.restart",
								defaultMessage: "Restart task",
							})}
							onClick={onRestart}
						>
							<RotateCcw aria-hidden className="size-3.5" />
						</GlyphButton>
					) : null}
					{onReturnToMain ? (
						<GlyphButton
							label={t({
								id: "popup-shell.return-to-main",
								defaultMessage: "Return to main window",
							})}
							onClick={onReturnToMain}
						>
							<CornerUpLeft aria-hidden className="size-3.5" />
						</GlyphButton>
					) : null}
					<GlyphButton
						label={t({ id: "popup-shell.close", defaultMessage: "Close" })}
						onClick={onClose}
						tone="danger"
					>
						<X aria-hidden className="size-3.5" />
					</GlyphButton>
				</div>
			</header>
			{progress !== undefined ? (
				<div
					aria-valuemax={100}
					aria-valuemin={0}
					aria-valuenow={Math.max(0, Math.min(100, progress))}
					className="h-px bg-base-200"
					role="progressbar"
				>
					<div
						className="h-px bg-primary transition-[width] duration-150"
						style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
					/>
				</div>
			) : null}
			<main className="min-h-0 flex-1 overflow-auto">{children}</main>
		</div>
	);
}

function GlyphButton({
	label,
	onClick,
	active,
	tone = "neutral",
	children,
}: {
	label: string;
	onClick: () => void;
	active?: boolean;
	tone?: "neutral" | "danger";
	children: ReactNode;
}) {
	return (
		<button
			aria-label={label}
			aria-pressed={active}
			className={cn(
				"grid size-5 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				active
					? "bg-primary/15 text-primary"
					: tone === "danger"
						? "text-base-content/60 hover:bg-error/10 hover:text-error"
						: "text-base-content/60 hover:bg-base-200 hover:text-base-content",
			)}
			onClick={onClick}
			title={label}
			type="button"
		>
			{children}
		</button>
	);
}

/**
 * Inline pin icon — react-feather doesn't ship a thumbtack, and
 * MapPin / Anchor read as "location" / "ship" rather than
 * "pin-on-top". Inline SVG keeps the glyph semantically clear.
 *
 * When `pinned`, the pin tilts to indicate the active state.
 */
function PinIcon({
	className,
	pinned,
}: {
	className?: string;
	pinned?: boolean;
}) {
	return (
		<svg
			aria-hidden
			className={cn(className, pinned && "-rotate-12 transition-transform")}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			viewBox="0 0 24 24"
		>
			<path d="M12 17v5" />
			<path d="M9 10.76V5h6v5.76l2.41 4.13a1 1 0 0 1-.86 1.51H7.45a1 1 0 0 1-.86-1.51L9 10.76z" />
		</svg>
	);
}
