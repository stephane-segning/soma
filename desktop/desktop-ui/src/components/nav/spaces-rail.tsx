/**
 * SpacesRail — 52px icon-only column on the far left of the workspace
 * shell. The first column of the four-column layout locked in
 * [ADR-0005 §2](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and detailed in
 * [refs space-lifecycle §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-space-lifecycle.md).
 *
 * Click an icon to switch space. Hover → native tooltip with the space
 * name (via `title`). Right-click / long-press (caller wires the
 * popover via `onContextMenu`) opens the per-space contextual menu.
 *
 * No labels in the rail itself — the icon is the entire affordance.
 */
import type { MouseEvent, ReactNode } from "react";
import { Plus } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type SpaceRailItem = {
	id: string;
	/**
	 * Two-letter monogram, single emoji, or any ReactNode used as the
	 * icon. Keep it 24px max — the rail is dense.
	 */
	icon: ReactNode;
	/** Shown as the native tooltip on hover. */
	name: string;
	/**
	 * Optional status indicator dot color. Maps to `bg-{tone}`. Used to
	 * surface unread / syncing / error states without expanding the rail.
	 */
	statusTone?: "info" | "success" | "warning" | "error";
};

export type SpacesRailProps = {
	items: SpaceRailItem[];
	/** ID of the currently-active space. Falsy values render no active indicator. */
	activeId?: string | null;
	onSelect: (id: string) => void;
	/**
	 * Right-click handler — typically opens the per-space contextual
	 * popover (Settings, Leave). Receives the space id and the native
	 * event so the caller can position the popover.
	 */
	onContextItem?: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
	/** Triggered by the trailing `+` button. */
	onCreate?: () => void;
	className?: string;
};

export function SpacesRail({
	items,
	activeId,
	onSelect,
	onContextItem,
	onCreate,
	className,
}: SpacesRailProps) {
	const t = useT();
	return (
		<nav
			aria-label={t({
				id: "spaces-rail.aria-label",
				defaultMessage: "Spaces",
			})}
			className={cn(
				"flex h-full w-[52px] shrink-0 flex-col items-center gap-1 border-base-300 border-r bg-base-100 py-2",
				className,
			)}
		>
			{items.map((item) => (
				<RailIcon
					active={item.id === activeId}
					item={item}
					key={item.id}
					onContextMenu={
						onContextItem
							? (event) => {
									event.preventDefault();
									onContextItem(item.id, event);
								}
							: undefined
					}
					onSelect={() => onSelect(item.id)}
				/>
			))}
			{onCreate ? (
				<button
					aria-label={t({
						id: "spaces-rail.create",
						defaultMessage: "Create space",
					})}
					className="mt-1 inline-flex size-9 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content focus-visible:bg-base-200 focus-visible:outline-none"
					onClick={onCreate}
					type="button"
				>
					<Plus aria-hidden className="size-4" />
				</button>
			) : null}
		</nav>
	);
}

function RailIcon({
	item,
	active,
	onSelect,
	onContextMenu,
}: {
	item: SpaceRailItem;
	active: boolean;
	onSelect: () => void;
	onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
	return (
		<button
			aria-current={active ? "page" : undefined}
			aria-label={item.name}
			className={cn(
				"relative inline-flex size-9 items-center justify-center rounded-md text-body transition-colors",
				active
					? "bg-primary/15 text-primary"
					: "text-base-content/80 hover:bg-base-200 hover:text-base-content",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
			)}
			onClick={onSelect}
			onContextMenu={onContextMenu}
			title={item.name}
			type="button"
		>
			{active ? (
				<span
					aria-hidden
					className="absolute inset-y-1.5 left-[-9px] w-0.5 rounded-r-sm bg-primary"
				/>
			) : null}
			{item.statusTone ? (
				<span
					aria-hidden
					className={cn(
						"absolute top-0.5 right-0.5 size-1.5 rounded-full",
						statusToneClass[item.statusTone],
					)}
				/>
			) : null}
			{item.icon}
		</button>
	);
}

const statusToneClass: Record<NonNullable<SpaceRailItem["statusTone"]>, string> =
	{
		info: "bg-info",
		success: "bg-success",
		warning: "bg-warning",
		error: "bg-error",
	};
