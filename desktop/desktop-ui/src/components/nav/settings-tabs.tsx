/**
 * SettingsTabs — horizontal pill/underline tabs under a settings page
 * title, one tab = one screen of sectioned cards.
 *
 * Locked by [refs space-lifecycle §4.2](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-space-lifecycle.md)
 * and [ADR-0005 §3](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md).
 *
 * The component is purely the navigation strip — it does not render
 * the tab body. Callers control auto-save semantics, error rendering,
 * etc. on the panel beneath.
 */
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { cn } from "../../utils/cn";

export type SettingsTab = {
	id: string;
	label: string;
	/** Optional leading icon, typically 14–16px. */
	icon?: ReactNode;
	/** Optional accessibility hint for badges like "Danger". */
	tone?: "default" | "danger";
};

export type SettingsTabsProps = {
	tabs: SettingsTab[];
	activeId: string;
	onChange: (id: string) => void;
	className?: string;
	/**
	 * Optional aria-label for the tablist when the tabs are not
	 * immediately preceded by a heading the user can hear.
	 */
	"aria-label"?: string;
};

export function SettingsTabs({ tabs, activeId, onChange, className, "aria-label": ariaLabel }: SettingsTabsProps) {
	const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

	function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		event.preventDefault();
		const delta = event.key === "ArrowRight" ? 1 : -1;
		const nextIndex = (index + delta + tabs.length) % tabs.length;
		const nextTab = tabs[nextIndex];
		if (!nextTab) return;
		// Move focus AND switch the active tab — WAI-ARIA "automatic
		// activation" pattern, which suits per-screen settings tabs
		// (each tab is cheap; users expect content to follow focus).
		onChange(nextTab.id);
		tabRefs.current[nextIndex]?.focus();
	}

	return (
		<div
			aria-label={ariaLabel}
			className={cn(
				// `overflow-x-auto` + `scrollbar-none`: same pattern `AppTabs`
				// already uses for its own tab row. At desktop widths every
				// tab set observed so far fits, so this is inert (nothing to
				// scroll, zero visual change). At 402px a real 4-tab settings
				// page (Members/Invites/Bots/Assistant, text-only) sits right
				// at the edge of what fits, and a 6-tab set (verified via the
				// `SettingsTabs` Storybook story at 402px) genuinely overflows
				// — without this, the tabs past the edge become completely
				// unreachable (no scroll affordance existed at all). `shrink-0`
				// on each tab (below) stops flex from squeezing labels instead
				// of the row overflowing.
				"scrollbar-none flex w-full items-center gap-1 overflow-x-auto border-base-300 border-b",
				className,
			)}
			role="tablist"
		>
			{tabs.map((tab, index) => {
				const active = tab.id === activeId;
				return (
					<button
						aria-selected={active}
						className={cn(
							"relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
							active
								? "border-primary text-base-content"
								: "border-transparent text-base-content/60 hover:text-base-content",
							tab.tone === "danger" && (active ? "text-error" : "text-error/70 hover:text-error"),
						)}
						key={tab.id}
						onClick={() => onChange(tab.id)}
						onKeyDown={(event) => handleKeyDown(event, index)}
						ref={(node) => {
							tabRefs.current[index] = node;
						}}
						role="tab"
						tabIndex={active ? 0 : -1}
						type="button"
					>
						{tab.icon ? (
							<span aria-hidden className="text-base-content/60">
								{tab.icon}
							</span>
						) : null}
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
