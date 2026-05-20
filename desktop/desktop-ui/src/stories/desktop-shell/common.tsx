/**
 * Shared bits for the DesktopShell stories. Built on top of the same
 * daisyUI + Tailwind-native primitives as the rest of the @soma/ui
 * library (no `text-body / text-ui-sm`, no hand-rolled card chrome —
 * lean on `.btn`, `.list`, `.kbd`, `.badge`).
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
		<div className="flex items-center justify-between px-3 py-2">
			<div className="flex items-center gap-2">
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
		<div className="p-2">
			<p className="px-2 pb-1 font-semibold text-base-content/80 text-xs uppercase tracking-wide">
				Navigation
			</p>
			<ul className="list bg-base-100">
				{Array.from({ length: count }, (_, idx) => (
					<li className="list-row" key={`nav-${idx}`}>
						<span className="grid size-5 place-items-center rounded-md bg-base-200 text-base-content/60 text-xs">
							{idx + 1}
						</span>
						<span className="list-col-grow truncate text-sm">Section {idx + 1}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function InfoPanel({ count = 1 }: { count?: number }) {
	return (
		<div className="space-y-2 p-2 text-sm">
			<p className="px-2 font-semibold text-base-content/80 text-xs uppercase tracking-wide">
				Info
			</p>
			<div className="rounded-md bg-base-200 p-3 text-base-content/70 text-xs">
				Main column scrolls independently while sidebars stay fixed.
			</div>
			{Array.from({ length: count }, (_, idx) => (
				<div className="px-2" key={`info-${idx}`}>
					Random {idx + 1}
				</div>
			))}
		</div>
	);
}
