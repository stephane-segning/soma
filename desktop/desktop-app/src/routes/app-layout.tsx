/**
 * AppLayout — Tauri V2 desktop shell composition.
 *
 * The full four-region layout the project owner specified:
 *
 *   ┌─────┬────────────┬──────────────────────┬──────────────┐
 *   │ SR  │ Inner-Left │       Main           │ Right Rail   │
 *   │ 52  │   ~280     │      flex            │     ~320     │
 *   └─────┴────────────┴──────────────────────┴──────────────┘
 *
 * - **Outer spaces rail** (`SpacesRailContainer`): 52-px icon column.
 *   Pulls real `backend.spaces.list()` data.
 * - **Inner-left rail** (`LeftInnerRail`): `PanelContainer` stack of
 *   Pages (`TreePopover` over `backend.pages.list`) + Nav.
 * - **Main column**: `AppTabs` (top) + `<Outlet />` (routed content).
 * - **Right rail** (`RightRail`): `PanelContainer` stack of Chat
 *   (`AiChat` + composer) + Bots (`BotList`).
 *
 * The custom header is a drag-region only; chrome content is the app
 * title at the left + language switcher at the right. The explicit
 * `onMouseDown={startWindowDrag}` keeps Tauri's window-drag working
 * regardless of the auto-attached listener's timing (see PR #129).
 */

import { AppTabs } from "@soma/ui/components/layout/app-tabs";
import { DesktopShell } from "@soma/ui/components/layout/desktop-shell";
import { PanelChipBar } from "@soma/ui/components/panels/panel-chip-bar";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router";
import { LEFT_RAIL_DEFAULT_EXPANDED, LEFT_RAIL_PANEL_IDS, LeftInnerRail } from "../components/LeftInnerRail";
import { RIGHT_RAIL_PANEL_IDS, RightRail, rightRailChipDescriptors } from "../components/RightRail";
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

	// Lifted expansion state for both rails, so the matching
	// `PanelChipBar` in the main column corners can re-open panels the
	// user collapsed via the panel header's `−` button.
	const [leftExpanded, setLeftExpanded] = useState<Set<string>>(() => new Set(LEFT_RAIL_DEFAULT_EXPANDED));
	const [rightExpanded, setRightExpanded] = useState<Set<string>>(
		() => new Set([RIGHT_RAIL_PANEL_IDS.chat, RIGHT_RAIL_PANEL_IDS.bots]),
	);

	const toggleLeftPanel = useCallback((id: string) => {
		setLeftExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);
	const toggleRightPanel = useCallback((id: string) => {
		setRightExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const leftChipPanels = useMemo(
		() => [
			{ id: LEFT_RAIL_PANEL_IDS.pages, icon: <span aria-hidden>P</span>, label: t("panels.pages.title", "Pages") },
			{ id: LEFT_RAIL_PANEL_IDS.nav, icon: <span aria-hidden>N</span>, label: t("panels.nav.title", "Nav") },
		],
		[t],
	);
	const rightChipPanels = useMemo(
		() => rightRailChipDescriptors(t("panels.chat.title", "Chat"), t("panels.bots.title", "Bots")),
		[t],
	);

	return (
		<DesktopShell
			defaultLeftOpen={true}
			defaultRightOpen={true}
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
			initialLeftWidth={332}
			initialRightWidth={320}
			leftColumn={
				<div className="flex h-full">
					<SpacesRailContainer />
					<div className="flex-1 border-base-300 border-l">
						<LeftInnerRail expandedIds={leftExpanded} onCollapse={toggleLeftPanel} />
					</div>
				</div>
			}
			leftMaxWidth={460}
			leftMinWidth={280}
			mainClassName="bg-base-200/60 flex min-h-screen flex-col"
			mainTopLeft={
				<PanelChipBar
					expandedIds={leftExpanded}
					onToggle={toggleLeftPanel}
					panels={leftChipPanels}
					placement="top-left"
				/>
			}
			mainTopRight={
				<PanelChipBar
					expandedIds={rightExpanded}
					onToggle={toggleRightPanel}
					panels={rightChipPanels}
					placement="top-right"
				/>
			}
			rightColumn={<RightRail expandedIds={rightExpanded} onCollapse={toggleRightPanel} />}
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
