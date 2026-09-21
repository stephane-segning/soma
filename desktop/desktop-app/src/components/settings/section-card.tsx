/**
 * SectionCard — flat section wrapper shared by every settings surface
 * (`/settings` and `spaces/:spaceId/settings`): a title + optional
 * description header over the section's content.
 *
 * No card chrome (border/shadow) — the page surface plus the
 * `SettingsTabs` strip already provide enough separation; a bordered,
 * shadowed card on top of the tinted main surface read as "card stuffed
 * in a card" (see `settings.tsx`'s original doc comment for this call).
 *
 * Extracted out of `settings.tsx` so the space-settings Members/Bots tabs
 * share the exact same section rhythm instead of a second hand-rolled copy.
 */
import type { ReactNode } from "react";

export function SectionCard({
	title,
	description,
	actions,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	/** Optional trailing slot for a header-level primary action (e.g. "Add bot" — ADR-0005 §3: primary actions exist only for initiation or destruction). */
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section>
			<header className="mb-4 flex items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h2 className="font-medium text-base">{title}</h2>
					{description ? <p className="text-base-content/60 text-sm">{description}</p> : null}
				</div>
				{actions ? <div className="shrink-0">{actions}</div> : null}
			</header>
			{children}
		</section>
	);
}
