/**
 * SpacesIndex — `/spaces`, the "no space selected" landing.
 *
 * The spaces themselves live in the outer rail, so this screen's only
 * job is to orient: pick a space from the rail, or create one. It has
 * nothing else to show, so a centered `Empty` is the right call here
 * (per AGENTS §UI — centered placards are fine when the screen has
 * nothing else to do).
 *
 * The developer `BackendStatusPanel` that used to live here was removed
 * — daemon identity lives in Settings → Account; the live-event tail was
 * a debug surface that didn't belong on a user route.
 *
 * It's also the landing surface for two commands that can fail before
 * any space-scoped route exists to show the error itself (ADR-0005 §6
 * — no toast-only feedback): "New Space" (native menu / ⌘⇧N / palette)
 * when `backend.spaces.create` rejects, and "New Page" (⌘N) when there
 * is no active space to create it in at all. Both land here via
 * `useNavigationNotice()` — see `CommandPaletteRoot`.
 */
import { Empty } from "@soma/ui/components/primitives/empty";
import { useTranslation } from "react-i18next";
import { useNavigationNotice } from "../lib/use-navigation-notice";

export function SpacesIndex() {
	const { t } = useTranslation();
	const notice = useNavigationNotice();
	return (
		<main className="grid min-h-full place-items-center px-8 py-10">
			<Empty
				headline={t("pages.spaces_index.headline", "No space selected")}
				subtext={
					<span className="flex flex-col items-center gap-1">
						<span>{t("pages.spaces_index.empty", "Pick a space from the rail, or create one to get started.")}</span>
						{notice ? <span className="text-error">{notice}</span> : null}
					</span>
				}
			/>
		</main>
	);
}
