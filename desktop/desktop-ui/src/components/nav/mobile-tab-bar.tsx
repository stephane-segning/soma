/**
 * MobileTabBar — the primary navigation at `DesktopShell`'s
 * "verySmall" tier (ADR-0005 §2 deviation — see `DesktopShell`'s
 * `leftGutter` / `mobileNav` doc comments). A full-width row of
 * thumb-reachable tabs, each an icon + text label, replacing the top
 * `PanelChipBar` corner chips that tier can no longer usefully show
 * (icon-only chips with no room for a label read as four unlabelled
 * dots on a phone).
 *
 * Dumb/presentational — no panel-id semantics, no tier detection of
 * its own, no opinion on what re-tapping the active tab should do.
 * The caller decides `items`, `activeId`, and what `onSelect` means;
 * at phone width that's `desktop-app`'s `MobileTabBarContainer`,
 * wiring Pages/Chat/Bots/More onto the shared rail-expansion state via
 * `lib/mobile-nav.ts`'s pure transition rules.
 *
 * Visual: dense icon vocabulary, not oversized touch chrome — v0 ships
 * dense only (ADR-0005 §7). Each cell's *box* is generously sized
 * (`min-h-[52px]`, `flex-1`) so the tap target is comfortable without
 * inflating the icon/label past the rest of the shell's density,
 * mirroring how `shell-tap-target` grows hit area without growing
 * visual size elsewhere in this vocabulary (styles.css).
 */
import type { ReactNode } from "react";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type MobileTabBarItem = {
	id: string;
	/** Already-sized icon node — reuse the same glyph `PanelChipBar` uses for this panel. */
	icon: ReactNode;
	label: string;
};

export type MobileTabBarProps = {
	items: ReadonlyArray<MobileTabBarItem>;
	/** id of the tab currently shown fullscreen, or `null`/`undefined` when the editor is showing (no panel open). */
	activeId?: string | null;
	/**
	 * Fired on every tap, including a tap on the already-active tab —
	 * the caller decides what re-tapping the active tab means (this
	 * shell closes it and returns to the editor; see
	 * `lib/mobile-nav.ts`'s `selectMobileTab`).
	 */
	onSelect: (id: string) => void;
	className?: string;
};

export function MobileTabBar({
	items,
	activeId,
	onSelect,
	className,
}: MobileTabBarProps) {
	const t = useT();
	if (items.length === 0) return null;

	return (
		<nav
			aria-label={t({
				id: "mobile-tab-bar.aria-label",
				defaultMessage: "Primary navigation",
			})}
			className={cn(
				"flex w-full border-base-300 border-t bg-base-100",
				className,
			)}
		>
			{items.map((item) => {
				const active = item.id === activeId;
				return (
					<button
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset",
							active
								? "text-primary"
								: "text-base-content/60 hover:text-base-content",
						)}
						key={item.id}
						onClick={() => onSelect(item.id)}
						type="button"
					>
						<span aria-hidden className="flex items-center justify-center">
							{item.icon}
						</span>
						<span className="font-medium text-[10px] leading-none">
							{item.label}
						</span>
					</button>
				);
			})}
		</nav>
	);
}
