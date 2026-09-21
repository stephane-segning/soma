/**
 * BotsPanel — the bot roster for the currently-routed space, rendered
 * inside the right rail's "Bots" panel.
 *
 * Wires `@soma/ui`'s `BotList` to `backend.spaces.bots(spaceId)`. When
 * the user is not on a space route, we render the `Empty` primitive
 * with a "Select a space" message instead of an empty `BotList` so the
 * panel never silently looks broken.
 *
 * NOT `useParams()` for the active space. `BotsPanel` renders inside
 * `RightRail`, which `AppLayout` passes as its `rightColumn` prop — a
 * *sibling* of `<Outlet />`, not a descendant, so route params from the
 * nested `spaces/:spaceId` route were never visible here: `spaceId` was
 * silently always `null`, so this panel could never show a single bot
 * for any space (same bug `chat-panel.tsx` had before its fix — see
 * that file's doc comment, and `nav-panel.tsx`'s for the same fix
 * applied there too). Derive it from the live pathname instead.
 *
 * Click handling on rows is a TODO — once a bot-detail surface exists,
 * `onSelect` should navigate to it. For now we just `console.info` so
 * the wire-up is visible without committing to a route shape.
 */

import type { Bot } from "@soma/ui/components/lists/bot-list";
import { BotList } from "@soma/ui/components/lists/bot-list";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { parseActiveSpaceId } from "../../lib/active-space";
import { backend } from "../../lib/backend";
import { toUiBot } from "../../lib/space-settings";

/** Inline muted status line — one row, no centered placard. Matches the
 *  pages-panel empty-state vocabulary so every rail panel reads alike. */
function BotsLine({ children }: { children: ReactNode }) {
	return <div className="px-3 py-2 text-base-content/55 text-xs">{children}</div>;
}

type LoadState =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "error"; message: string }
	| { phase: "ready"; bots: Bot[] };

export function BotsPanel(): React.JSX.Element {
	const { t } = useTranslation();
	const { pathname } = useLocation();
	const spaceId = parseActiveSpaceId(pathname);
	const [state, setState] = useState<LoadState>({ phase: "idle" });

	useEffect(() => {
		if (!spaceId) {
			setState({ phase: "idle" });
			return;
		}
		let cancelled = false;
		setState({ phase: "loading" });
		(async () => {
			try {
				const result = await backend.spaces.bots(spaceId);
				if (cancelled) return;
				setState({ phase: "ready", bots: result.map(toUiBot) });
			} catch (err) {
				if (cancelled) return;
				const message = err instanceof Error ? err.message : String(err);
				setState({ phase: "error", message });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spaceId]);

	if (!spaceId) {
		return <BotsLine>{t("panels.bots.no_space", "Select a space")}</BotsLine>;
	}

	if (state.phase === "loading" || state.phase === "idle") {
		return <BotsLine>{t("panels.bots.loading", "Loading bots…")}</BotsLine>;
	}

	if (state.phase === "error") {
		return (
			<div className="px-3 py-2 text-error text-xs">
				{t("panels.bots.error", "Failed to load bots: {{message}}", { message: state.message })}
			</div>
		);
	}

	return (
		<BotList
			bots={state.bots}
			onSelect={(id) => {
				// TODO: navigate to a per-bot detail surface once one exists.
				console.info("[bots-panel] selected bot", id);
			}}
		/>
	);
}
