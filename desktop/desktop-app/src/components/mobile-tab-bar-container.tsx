/**
 * MobileTabBarContainer — builds `@soma/ui`'s `MobileTabBar` `items`
 * list from the same chip descriptors `AppLayout` already builds for
 * the "comfortable"/"tight" `PanelChipBar`s (`leftChipPanels` /
 * `rightChipPanels`), per the house rule of composing over
 * re-implementing. Four tabs in a fixed order: Pages, Chat, Bots, then
 * the Nav panel relabelled "More" (there is no separate "Nav" concept
 * on a phone-width nav bar — it's just wherever the leftover static
 * routes live).
 *
 * Purely a mapping layer — `activeId` and the tap handler are owned by
 * `AppLayout` (see `lib/mobile-nav.ts`), not this component, so the
 * actual navigation *rule* stays unit-testable without React.
 */

import { MobileTabBar } from "@soma/ui/components/nav/mobile-tab-bar";
import type { PanelChipDescriptor } from "@soma/ui/components/panels/panel-chip-bar";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MobileNavSide, MobileNavTarget } from "../lib/mobile-nav";
import { LEFT_RAIL_PANEL_IDS } from "./left-inner-rail";
import { RIGHT_RAIL_PANEL_IDS } from "./right-rail";

type MobileTab = { id: string; icon: ReactNode; label: string; side: MobileNavSide };

export type MobileTabBarContainerProps = {
	activeId: string | null;
	leftChipPanels: ReadonlyArray<PanelChipDescriptor>;
	rightChipPanels: ReadonlyArray<PanelChipDescriptor>;
	onSelect: (target: MobileNavTarget) => void;
};

export function MobileTabBarContainer({
	activeId,
	leftChipPanels,
	rightChipPanels,
	onSelect,
}: MobileTabBarContainerProps) {
	const { t } = useTranslation();

	const items = useMemo<MobileTab[]>(() => {
		const pagesChip = leftChipPanels.find((panel) => panel.id === LEFT_RAIL_PANEL_IDS.pages);
		const navChip = leftChipPanels.find((panel) => panel.id === LEFT_RAIL_PANEL_IDS.nav);
		const chatChip = rightChipPanels.find((panel) => panel.id === RIGHT_RAIL_PANEL_IDS.chat);
		const botsChip = rightChipPanels.find((panel) => panel.id === RIGHT_RAIL_PANEL_IDS.bots);

		const tabs: Array<MobileTab | undefined> = [
			pagesChip && { id: pagesChip.id, icon: pagesChip.icon, label: pagesChip.label ?? "", side: "left" },
			chatChip && { id: chatChip.id, icon: chatChip.icon, label: chatChip.label ?? "", side: "right" },
			botsChip && { id: botsChip.id, icon: botsChip.icon, label: botsChip.label ?? "", side: "right" },
			navChip && { id: navChip.id, icon: navChip.icon, label: t("panels.more.title", "More"), side: "left" },
		];
		return tabs.filter((tab): tab is MobileTab => tab !== undefined);
	}, [leftChipPanels, rightChipPanels, t]);

	return (
		<MobileTabBar
			activeId={activeId}
			items={items}
			onSelect={(id) => {
				const tab = items.find((item) => item.id === id);
				if (tab) onSelect({ side: tab.side, id: tab.id });
			}}
		/>
	);
}
