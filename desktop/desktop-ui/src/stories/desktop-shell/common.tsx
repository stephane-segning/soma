import { Info, Menu } from "react-feather";

export function ShellHeader({ title, toggleLeft, toggleRight }: { title: string; toggleLeft: () => void; toggleRight: () => void }) {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<button aria-label="Toggle navigation" className="btn btn-ghost btn-xs rounded-full" onClick={toggleLeft} type="button">
					<Menu size={14} />
				</button>
				<h1 className="font-semibold text-xl">{title}</h1>
			</div>
			<button aria-label="Toggle info" className="btn btn-ghost btn-xs rounded-full" onClick={toggleRight} type="button">
				<Info size={14} />
			</button>
		</div>
	);
}

export function NavigationPanel({ count = 3 }: { count?: number }) {
	return (
		<div className="space-y-2 text-sm">
			<p className="font-semibold text-base-content/80">Navigation</p>
			<ul className="space-y-1 text-base-content/70">
				{Array.from({ length: count }, (_, idx) => (
					<li key={`nav-${idx}`}>Section {idx + 1}</li>
				))}
			</ul>
		</div>
	);
}

export function InfoPanel({ count = 1 }: { count?: number }) {
	return (
		<div className="space-y-2 text-sm">
			<p className="font-semibold text-base-content/80">Info</p>
			<div className="rounded-lg bg-base-200/60 p-3 text-base-content/70 text-xs">
				Main column scrolls independently while sidebars stay fixed.
			</div>
			{Array.from({ length: count }, (_, idx) => (
				<div className="block" key={`info-${idx}`}>Random {idx + 1}</div>
			))}
		</div>
	);
}
