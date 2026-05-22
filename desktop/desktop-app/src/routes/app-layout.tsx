/**
 * AppLayout — Phase 1 of the Tauri V2 desktop shell.
 *
 * Composes the shared `@soma/ui` `DesktopShell` with a minimal
 * drag-region header, the spaces rail on the left, an `AppTabs`
 * strip at the top of the main column for cross-section navigation,
 * and the routed page below it.
 */

import { AppTabs } from "@soma/ui/components/layout/app-tabs";
import { DesktopShell } from "@soma/ui/components/layout/desktop-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router";
import { SpacesRailContainer } from "../components/SpacesRailContainer";

/**
 * Explicit drag handler so we don't depend on Tauri's auto-attached
 * `data-tauri-drag-region` listener (which can no-op when React's
 * reconciler updates a previously-styled custom-chrome header).
 * Bails on right-clicks (so the OS context menu still works) and on
 * elements opting out via `data-no-drag`.
 */
function startWindowDrag(event: MouseEvent<HTMLElement>): void {
	if (event.button !== 0) return;
	const target = event.target as HTMLElement | null;
	if (target?.closest("[data-no-drag]")) return;
	void getCurrentWindow().startDragging();
}

/**
 * Top-level destinations the user can park on. Keeping this list small
 * and route-driven (not document-driven) — the real document tabs will
 * land with the editor work; these are the Spaces / Settings / focus-
 * probe entries the user reaches before any document is open.
 *
 * `id` is the canonical path prefix used to derive the active tab from
 * `useLocation().pathname`. The longest-matching prefix wins so deeper
 * routes (`/spaces/:id/...`) still highlight the Spaces tab.
 */
const ROUTE_TABS: ReadonlyArray<{ id: string; titleKey: string; fallback: string; path: string }> = [
	{ id: "/spaces", titleKey: "nav.spaces", fallback: "Spaces", path: "/spaces" },
	{ id: "/settings", titleKey: "nav.settings", fallback: "Settings", path: "/settings" },
	{ id: "/spike/editor", titleKey: "nav.editor", fallback: "Editor", path: "/spike/editor" },
];

function activeTabId(pathname: string): string | undefined {
	return ROUTE_TABS.slice()
		.sort((a, b) => b.id.length - a.id.length)
		.find((tab) => pathname === tab.id || pathname.startsWith(`${tab.id}/`))?.id;
}

export function AppLayout() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const tabs = ROUTE_TABS.map(({ id, titleKey, fallback }) => ({ id, title: t(titleKey, fallback) }));
	const activeId = activeTabId(location.pathname);
	return (
		<DesktopShell
			defaultLeftOpen={true}
			header={() => (
				// biome-ignore lint/a11y/noStaticElementInteractions: window drag region is inherently mouse-only chrome, not a focusable control
				<header
					className="sticky top-0 z-40 flex h-12 select-none items-center gap-2 border-base-300 border-b bg-base-100/95 backdrop-blur"
					data-tauri-drag-region
					onMouseDown={startWindowDrag}
					style={{ paddingLeft: "var(--shell-titlebar-pad-left, 80px)", paddingRight: "0.75rem" }}
				>
					<div
						className="font-semibold text-base-content/70 text-xs uppercase tracking-[0.12em]"
						data-tauri-drag-region
					>
						{t("app.title")}
					</div>
					<div className="flex-1" data-tauri-drag-region />
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
			mainClassName="bg-base-200/60 flex min-h-screen flex-col"
		>
			<AppTabs
				activeId={activeId}
				aria-label={t("nav.aria_label", "Top-level navigation")}
				className="border-base-300 border-b bg-base-100/70 px-3"
				onSelect={(id) => {
					const tab = ROUTE_TABS.find((t) => t.id === id);
					if (tab) navigate(tab.path);
				}}
				tabs={tabs}
			/>
			<div className="flex-1 overflow-auto">
				<Outlet />
			</div>
		</DesktopShell>
	);
}
