/**
 * Shared bits for the DesktopShell stories. Built on top of the same
 * daisyUI + Tailwind-native primitives as the rest of the @soma/ui
 * library (no `text-body / text-ui-sm`, no hand-rolled card chrome —
 * lean on `.btn`, `.list list-dense`, `.kbd`, `.badge`).
 */
import { Info, Menu } from "react-feather";

export function ShellHeader({
	title,
	toggleLeft,
	toggleRight,
}: {
	title: string;
	toggleLeft: () => void;
	toggleRight: () => void;
}) {
	return (
		<div className="flex items-center justify-between px-2 py-1.5">
			<div className="flex items-center gap-1">
				<button
					aria-label="Toggle navigation"
					className="btn btn-ghost btn-square btn-xs"
					onClick={toggleLeft}
					type="button"
				>
					<Menu size={14} />
				</button>
				<h1 className="font-semibold text-sm">{title}</h1>
			</div>
			<button
				aria-label="Toggle info"
				className="btn btn-ghost btn-square btn-xs"
				onClick={toggleRight}
				type="button"
			>
				<Info size={14} />
			</button>
		</div>
	);
}

export function NavigationPanel({ count = 3 }: { count?: number }) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex h-7 items-center border-base-300 border-b px-2">
				<p className="font-medium text-[11px] text-base-content/70 uppercase tracking-wide">
					Navigation
				</p>
			</div>
			<ul className="list flex-1 list-dense bg-base-100">
				{Array.from({ length: count }, (_, idx) => (
					<li className="list-row hover:bg-base-200" key={`nav-${idx}`}>
						<span className="grid size-4 place-items-center rounded bg-base-200 text-[10px] text-base-content/60">
							{idx + 1}
						</span>
						<span className="list-col-grow truncate">Section {idx + 1}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function InfoPanel({ count = 1 }: { count?: number }) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex h-7 items-center border-base-300 border-b px-2">
				<p className="font-medium text-[11px] text-base-content/70 uppercase tracking-wide">
					Info
				</p>
			</div>
			<div className="space-y-2 p-2 text-sm">
				<div className="rounded bg-base-200 p-2 text-[12px] text-base-content/70">
					Main column scrolls independently while sidebars stay fixed.
				</div>
				{Array.from({ length: count }, (_, idx) => (
					<div className="text-[12px] text-base-content/70" key={`info-${idx}`}>
						Random {idx + 1}
					</div>
				))}
			</div>
		</div>
	);
}
