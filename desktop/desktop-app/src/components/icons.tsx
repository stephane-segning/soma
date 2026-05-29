/**
 * Shared inline icons for the shell. `desktop-app` deliberately doesn't
 * pull in `react-feather` (see PR #135), so the handful of glyphs the
 * shell needs are hand-rolled feather-style SVGs. Size is controlled by
 * the caller via `className` (defaults to `size-3.5`, the canonical
 * chip/header glyph size).
 */
import type { ReactNode } from "react";

type IconProps = { className?: string };

export function PagesIcon({ className = "size-3.5" }: IconProps): ReactNode {
	return (
		<svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
			<path
				d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function NavIcon({ className = "size-3.5" }: IconProps): ReactNode {
	return (
		<svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
			<circle cx="12" cy="12" r="9" />
			<path d="m16 8-5 2-2 5 5-2z" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function SettingsIcon({ className = "size-4" }: IconProps): ReactNode {
	return (
		<svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
			<circle cx="12" cy="12" r="3" />
			<path
				d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
