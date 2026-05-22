/**
 * BotsPanel — the bot roster for the currently-routed space, rendered
 * inside the right rail's "Bots" panel.
 *
 * Wires `@soma/ui`'s `BotList` to `backend.spaces.bots(spaceId)`. When
 * the user is not on a space route, we render the `Empty` primitive
 * with a "Select a space" message instead of an empty `BotList` so the
 * panel never silently looks broken.
 *
 * Click handling on rows is a TODO — once a bot-detail surface exists,
 * `onSelect` should navigate to it. For now we just `console.info` so
 * the wire-up is visible without committing to a route shape.
 */

import type { StoredSpaceBot } from "@soma/sdk";
import type { Bot } from "@soma/ui/components/lists/bot-list";
import { BotList } from "@soma/ui/components/lists/bot-list";
import { Empty } from "@soma/ui/components/primitives/empty";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { backend } from "../../lib/backend";

function asBotStatus(status: string): Bot["status"] {
	if (status === "active" || status === "pending" || status === "failed" || status === "expired") {
		return status;
	}
	return "pending";
}

function toUiBot(stored: StoredSpaceBot): Bot {
	return {
		id: stored.peerId,
		alias: stored.alias ?? stored.peerId.slice(0, 8),
		peerId: stored.peerId,
		status: asBotStatus(stored.status),
	};
}

type LoadState =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "error"; message: string }
	| { phase: "ready"; bots: Bot[] };

export function BotsPanel(): React.JSX.Element {
	const { t } = useTranslation();
	const { spaceId } = useParams<{ spaceId?: string }>();
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
		return (
			<Empty
				headline={t("panels.bots.no_space", "Select a space")}
				subtext={t("panels.bots.no_space_subtext", "Authorized bots for the active space will appear here.")}
			/>
		);
	}

	if (state.phase === "loading" || state.phase === "idle") {
		return (
			<div className="px-3 py-6 text-center text-base-content/50 text-sm">
				{t("panels.bots.loading", "Loading bots…")}
			</div>
		);
	}

	if (state.phase === "error") {
		return (
			<div className="px-3 py-6 text-center text-error text-sm">
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
