/**
 * AppLayout — Phase 1 of the Tauri V2 desktop shell.
 *
 * Composes the shared `@soma/ui` `DesktopShell` with a minimal header,
 * a mock-data spaces rail on the left, and the routed page in the
 * main column. The right column (chat sidebar) is deferred to Phase 4.
 */
import { DesktopShell } from "@soma/ui/components/layout/desktop-shell";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";
import { SpacesRailContainer } from "../components/SpacesRailContainer";

export function AppLayout() {
	const { t, i18n } = useTranslation();
	return (
		<DesktopShell
			defaultLeftOpen={true}
			header={() => (
				<header
					className="sticky top-0 z-40 flex h-12 select-none items-center gap-3 border-base-300 border-b bg-base-100/95 px-3 backdrop-blur"
					data-drag-region
				>
					<div className="font-semibold text-base-content/70 text-xs uppercase tracking-[0.12em]" data-drag-region>
						{t("app.title")}
					</div>
					<div className="flex-1" data-drag-region />
					<label className="flex items-center gap-2 text-xs" data-no-drag>
						<span className="opacity-70">{t("editor.language_switch")}</span>
						<select
							className="select select-bordered select-xs"
							onChange={(e) => void i18n.changeLanguage(e.target.value)}
							value={i18n.resolvedLanguage}
						>
							<option value="en">EN</option>
							<option value="fr">FR</option>
						</select>
					</label>
				</header>
			)}
			leftColumn={<SpacesRailContainer />}
			mainClassName="bg-base-200/60 min-h-screen"
		>
			<Outlet />
		</DesktopShell>
	);
}
