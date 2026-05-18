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
import type { ReactNode } from "react";
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

export function SettingsTabs({
	tabs,
	activeId,
	onChange,
	className,
	"aria-label": ariaLabel,
}: SettingsTabsProps) {
	return (
		<div
			aria-label={ariaLabel}
			className={cn(
				"flex w-full items-center gap-1 border-base-300 border-b",
				className,
			)}
			role="tablist"
		>
			{tabs.map((tab) => {
				const active = tab.id === activeId;
				return (
					<button
						aria-selected={active}
						className={cn(
							"-mb-px relative flex items-center gap-1.5 border-b-2 px-3 py-2 text-ui-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
							active
								? "border-primary text-base-content"
								: "border-transparent text-base-content/60 hover:text-base-content",
							tab.tone === "danger" &&
								(active ? "text-error" : "text-error/70 hover:text-error"),
						)}
						key={tab.id}
						onClick={() => onChange(tab.id)}
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
