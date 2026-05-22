/**
 * RightRail — the rightmost rail of the Tauri V2 desktop shell.
 *
 * Hosts two panels via `@soma/ui`'s `PanelContainer`:
 *  - Chat → `<ChatPanel />`
 *  - Bots → `<BotsPanel />`
 *
 * Both panels start expanded. Collapse / close interactions update
 * local `expandedIds` state so the user can hide a panel without
 * unmounting the rail. The matching chip strip (for re-expanding
 * collapsed panels) lives in the main column's top-right slot per the
 * `PanelContainer` contract; that wiring is the final composition
 * step's job, not this component's.
 */

import { PanelContainer, type PanelDescriptor } from "@soma/ui/components/panels/panel-container";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BotsPanel } from "./panels/bots-panel";
import { ChatPanel } from "./panels/chat-panel";

/** Tiny inline icons — kept inline so the desktop-app shell doesn't have
 *  to pull in `react-feather` just for two glyphs that the `PanelChipBar`
 *  in the main column doesn't even render yet. */
function ChatIcon({ label }: { label: string }): React.JSX.Element {
	return (
		<svg
			className="size-3.5"
			fill="none"
			role="img"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			viewBox="0 0 24 24"
		>
			<title>{label}</title>
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
		</svg>
	);
}

function BotIcon({ label }: { label: string }): React.JSX.Element {
	return (
		<svg
			className="size-3.5"
			fill="none"
			role="img"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			viewBox="0 0 24 24"
		>
			<title>{label}</title>
			<rect height="16" rx="2" ry="2" width="16" x="4" y="4" />
			<rect height="6" width="6" x="9" y="9" />
			<line x1="9" x2="9" y1="1" y2="4" />
			<line x1="15" x2="15" y1="1" y2="4" />
			<line x1="9" x2="9" y1="20" y2="23" />
			<line x1="15" x2="15" y1="20" y2="23" />
			<line x1="20" x2="23" y1="9" y2="9" />
			<line x1="20" x2="23" y1="14" y2="14" />
			<line x1="1" x2="4" y1="9" y2="9" />
			<line x1="1" x2="4" y1="14" y2="14" />
		</svg>
	);
}

const PANEL_IDS = {
	chat: "chat",
	bots: "bots",
} as const;

const DEFAULT_EXPANDED: ReadonlyArray<string> = [PANEL_IDS.chat, PANEL_IDS.bots];

export type RightRailProps = {
	/**
	 * Controlled expanded set. When provided, the rail's open/closed
	 * state is owned by the parent; `onCollapse` must be wired to remove
	 * ids. When omitted, state lives internally and both panels start
	 * expanded.
	 */
	expandedIds?: ReadonlySet<string> | ReadonlyArray<string>;
	/** Fired when a panel's header `−` button is clicked. */
	onCollapse?: (id: string) => void;
};

export function RightRail({ expandedIds, onCollapse }: RightRailProps = {}): React.JSX.Element {
	const { t } = useTranslation();
	const [internal, setInternal] = useState<Set<string>>(() => new Set(DEFAULT_EXPANDED));
	const controlled = expandedIds !== undefined;
	const expanded = useMemo<ReadonlySet<string>>(() => {
		if (!controlled) return internal;
		return expandedIds instanceof Set ? expandedIds : new Set(expandedIds);
	}, [controlled, expandedIds, internal]);

	const panels = useMemo<PanelDescriptor[]>(
		() => [
			{
				id: PANEL_IDS.chat,
				title: t("panels.chat.title", "Chat"),
				icon: <ChatIcon label={t("panels.chat.title", "Chat")} />,
				content: <ChatPanel />,
			},
			{
				id: PANEL_IDS.bots,
				title: t("panels.bots.title", "Bots"),
				icon: <BotIcon label={t("panels.bots.title", "Bots")} />,
				content: <BotsPanel />,
			},
		],
		[t],
	);

	const handleCollapse = useCallback(
		(id: string) => {
			if (controlled) {
				onCollapse?.(id);
				return;
			}
			setInternal((prev) => {
				if (!prev.has(id)) return prev;
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		},
		[controlled, onCollapse],
	);

	return <PanelContainer expandedIds={expanded} onClose={handleCollapse} onCollapse={handleCollapse} panels={panels} />;
}

/** Stable chip descriptors used by the matching `PanelChipBar` in
 *  AppLayout. Mirrors the `panels` array above (sans `content`) so the
 *  chip bar can re-expand collapsed panels. */
export function rightRailChipDescriptors(
	chatLabel: string,
	botsLabel: string,
): Array<{
	id: string;
	icon: ReactNode;
	label: string;
}> {
	return [
		{ id: PANEL_IDS.chat, icon: <ChatIcon label={chatLabel} />, label: chatLabel },
		{ id: PANEL_IDS.bots, icon: <BotIcon label={botsLabel} />, label: botsLabel },
	];
}

export const RIGHT_RAIL_PANEL_IDS = PANEL_IDS;
