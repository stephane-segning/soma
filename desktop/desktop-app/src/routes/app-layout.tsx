/**
 * AppLayout — Tauri V2 desktop shell composition.
 *
 *   ┌─────┬────────────┬──────────────────────┬──────────────┐
 *   │ SR  │ Inner-Left │       Main           │ Right Rail   │
 *   │ 52  │  collapses │      flex            │  collapses   │
 *   └─────┴────────────┴──────────────────────┴──────────────┘
 *
 * - **Outer spaces rail** (`SpacesRailContainer`): 52-px icon column,
 *   mounted as `DesktopShell`'s always-on `leftGutter` so it stays
 *   visible even when every inner panel is collapsed.
 * - **Inner-left rail** (`LeftInnerRail`): Pages + Nav panels. Passed
 *   as `leftColumn` *only when at least one panel is expanded* — when
 *   the user collapses both, `leftColumn` goes `null` and the rail
 *   animates to width 0 (no dead resizable column left behind).
 * - **Main column**: just the routed `<Outlet />`. No top-tab strip —
 *   Spaces is the gutter, Settings is the header gear, documents will
 *   get real tabs when the editor work lands.
 * - **Right rail** (`RightRail`): Chat + Bots panels, same
 *   collapse-to-zero behaviour via the right chip bar.
 *
 * The header is a drag-region with a single settings affordance on the
 * right. The explicit `onMouseDown={startWindowDrag}` keeps Tauri's
 * window-drag working regardless of the auto-attached listener's
 * timing (see PR #129). Language selection lives in Settings → General.
 */

import { DesktopShell } from "@soma/ui/components/layout/desktop-shell";
import { PanelChipBar } from "@soma/ui/components/panels/panel-chip-bar";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate } from "react-router";
import { NavIcon, PagesIcon, SettingsIcon } from "../components/icons";
import { LEFT_RAIL_DEFAULT_EXPANDED, LEFT_RAIL_PANEL_IDS, LeftInnerRail } from "../components/left-inner-rail";
import { RIGHT_RAIL_PANEL_IDS, RightRail, rightRailChipDescriptors } from "../components/right-rail";
import { SpacesRailContainer } from "../components/spaces-rail-container";

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

export function AppLayout() {
	const { t } = useTranslation();
	const navigate = useNavigate();

	// Lifted expansion state for both rails. The matching `PanelChipBar`
	// in the main column corners re-opens panels the user collapsed via
	// the panel header's `−` button — and is the *only* way back once a
	// rail has collapsed to zero width.
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
			{ id: LEFT_RAIL_PANEL_IDS.pages, icon: <PagesIcon />, label: t("panels.pages.title", "Pages") },
			{ id: LEFT_RAIL_PANEL_IDS.nav, icon: <NavIcon />, label: t("panels.nav.title", "Nav") },
		],
		[t],
	);
	const rightChipPanels = useMemo(
		() => rightRailChipDescriptors(t("panels.chat.title", "Chat"), t("panels.bots.title", "Bots")),
		[t],
	);

	// Collapse the inner rail to width 0 when no panel is open — passing
	// `leftColumn={null}` lets `ShellPanel` animate closed instead of
	// leaving a dead, resizable empty column beside the spaces gutter.
	const leftColumn =
		leftExpanded.size > 0 ? (
			<LeftInnerRail className="border-base-300 border-l" expandedIds={leftExpanded} onCollapse={toggleLeftPanel} />
		) : null;

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
					style={{ paddingLeft: "var(--shell-titlebar-pad-left, 80px)", paddingRight: "0.5rem" }}
				>
					<div
						className="font-semibold text-base-content/60 text-xs uppercase tracking-[0.14em]"
						data-tauri-drag-region
					>
						{t("app.title")}
					</div>
					<div className="flex-1" data-tauri-drag-region />
					<button
						aria-label={t("nav.settings", "Settings")}
						className="grid size-8 place-items-center rounded-md text-base-content/60 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						data-no-drag
						onClick={() => navigate("/settings")}
						title={t("nav.settings", "Settings")}
						type="button"
					>
						<SettingsIcon />
					</button>
				</header>
			)}
			initialLeftWidth={280}
			initialRightWidth={320}
			leftColumn={leftColumn}
			leftGutter={<SpacesRailContainer />}
			leftMaxWidth={420}
			leftMinWidth={220}
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
			rightColumn={
				rightExpanded.size > 0 ? <RightRail expandedIds={rightExpanded} onCollapse={toggleRightPanel} /> : null
			}
		>
			<div className="flex-1 overflow-auto">
				<Outlet />
			</div>
		</DesktopShell>
	);
}
