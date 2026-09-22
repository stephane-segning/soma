/**
 * SpaceSwitcher — the "verySmall"-tier replacement for the always-on
 * spaces rail (ADR-0005 §2 deviation — see `DesktopShell`'s
 * `leftGutter` doc comment). A header control naming the *current*
 * space (not a monogram — there's no icon rail left to carry that
 * vocabulary at this tier) that opens a sheet listing every space plus
 * "Create space" / "Join a space".
 *
 * Reuses `SpacesRail`'s `SpaceRailItem` shape so a container can share
 * the exact same space list + icon data with the rail it replaces
 * (`spaces-rail-container.tsx` at wider tiers). The sheet itself is
 * `@soma/ui`'s `Modal` in its `"bottom"` placement — the one
 * shadow-bearing surface ADR-0005 §7 allows outside the popup window —
 * with the list rendered as `DenseRow`s per ADR-0005 §9.
 *
 * Dumb/presentational: no backend calls, no routing. The caller wires
 * real data + navigation (`desktop-app`'s `SpaceSwitcherContainer`).
 */
import { useState } from "react";
import { Check, ChevronDown, LogIn, Plus } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { DenseRow } from "../lists/dense-row";
import { Modal } from "../overlays/modal";
import type { SpaceRailItem } from "./spaces-rail";

export type { SpaceRailItem };

export type SpaceSwitcherProps = {
	items: ReadonlyArray<SpaceRailItem>;
	/** id of the currently-active space. Falsy renders the placeholder label. */
	activeId?: string | null;
	onSelect: (id: string) => void;
	/** Omit to hide the "Create space" row. */
	onCreate?: () => void;
	/** Omit to hide the "Join a space" row. */
	onJoin?: () => void;
	className?: string;
};

export function SpaceSwitcher({
	items,
	activeId,
	onSelect,
	onCreate,
	onJoin,
	className,
}: SpaceSwitcherProps) {
	const t = useT();
	const [open, setOpen] = useState(false);
	const active = items.find((item) => item.id === activeId);
	const label =
		active?.name ??
		t({
			id: "space-switcher.placeholder",
			defaultMessage: "Select a space",
		});

	return (
		<>
			<button
				aria-label={t({
					id: "space-switcher.trigger",
					defaultMessage: "Switch space — {name}",
					values: { name: label },
				})}
				className={cn(
					"flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-base-content/80 text-xs uppercase tracking-[0.1em] hover:bg-base-200",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
					className,
				)}
				onClick={() => setOpen(true)}
				type="button"
			>
				<span className="min-w-0 truncate">{label}</span>
				<ChevronDown
					aria-hidden
					className="size-3.5 shrink-0 text-base-content/50"
				/>
			</button>
			<Modal
				onClose={() => setOpen(false)}
				open={open}
				placement="bottom"
				title={t({
					id: "space-switcher.title",
					defaultMessage: "Switch space",
				})}
			>
				<ul className="list -mx-2 max-h-[60vh] list-dense overflow-auto">
					{items.map((item) => (
						<DenseRow
							key={item.id}
							leading={
								<span
									aria-hidden
									className="grid size-6 place-items-center rounded bg-base-200 font-medium text-[11px]"
								>
									{item.icon}
								</span>
							}
							onClick={() => {
								setOpen(false);
								onSelect(item.id);
							}}
							primary={item.name}
							status={
								item.id === activeId ? (
									<Check aria-hidden className="size-3.5 text-primary" />
								) : null
							}
						/>
					))}
					{onCreate ? (
						<DenseRow
							leading={
								<Plus aria-hidden className="size-3.5 text-base-content/60" />
							}
							onClick={() => {
								setOpen(false);
								onCreate();
							}}
							primary={t({
								id: "space-switcher.create",
								defaultMessage: "Create space",
							})}
						/>
					) : null}
					{onJoin ? (
						<DenseRow
							leading={
								<LogIn aria-hidden className="size-3.5 text-base-content/60" />
							}
							onClick={() => {
								setOpen(false);
								onJoin();
							}}
							primary={t({
								id: "space-switcher.join",
								defaultMessage: "Join a space",
							})}
						/>
					) : null}
				</ul>
			</Modal>
		</>
	);
}
