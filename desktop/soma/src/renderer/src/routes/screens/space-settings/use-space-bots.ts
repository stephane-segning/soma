/**
 * useSpaceBots — renderer hook that backs the Bots tab in space
 * settings.
 *
 * Wired through:
 *  - **bots list** — `useListSpaceBotsQuery` calls
 *    `spaces_list_bots` → `DaemonClient.listSpaceBots` → napi
 *    `SomaHandle.listSpaceBots` → `DaemonHandle::list_space_bots`,
 *    which filters memberships server-side to `role === "bot"`.
 *  - **addBot** — calls `spaces_issue_issuer_capability` IPC →
 *    `DaemonClient.issueIssuerCapability` → napi
 *    `SomaHandle.issueIssuerCapability`. The form's `peerId` +
 *    `expiryDate` map onto `targetPeerId` + `expiresAt` (epoch-ms).
 *
 * Open follow-ups (per ui-revamp-v0-cutover-status):
 *  - **alias** and **scopeIds** from the form are not yet propagated
 *    to the daemon — the daemon's capability schema doesn't store
 *    them today. We synthesise a placeholder alias from the peer-id
 *    so the UI has something to render.
 *  - **status** — there's no bot status event stream yet. Every
 *    listed bot is reported as `active`; a `pending`/`failed` split
 *    waits on daemon event plumbing.
 */
import { useIssueIssuerCapabilityMutation, useSpaceBotsQuery } from "@app/queries/spaces";
import type { Bot, BotStatus } from "@soma/ui/components/lists/bot-list";
import { useCallback, useMemo, useState } from "react";

export type AddBotInput = {
	peerId: string;
	alias: string;
	scopeIds: string[];
	expiryDate: string | null;
};

export type UseSpaceBotsResult = {
	bots: Bot[];
	isLoading: boolean;
	loadError: string | null;
	addBot: (input: AddBotInput) => Promise<void>;
	isAdding: boolean;
	addError: string | null;
	clearAddError: () => void;
};

export function useSpaceBots(spaceId: string | undefined): UseSpaceBotsResult {
	const issue = useIssueIssuerCapabilityMutation();
	const listQuery = useSpaceBotsQuery(spaceId ?? "");
	const [addError, setAddError] = useState<string | null>(null);

	const bots = useMemo<Bot[]>(
		() => (listQuery.data ?? []).map(toBot),
		[listQuery.data],
	);

	const addBot = useCallback(
		async (input: AddBotInput) => {
			if (!spaceId) {
				const message = "No space is selected; cannot issue capability.";
				setAddError(message);
				throw new Error(message);
			}
			setAddError(null);
			// `expiresAt = 0` is the daemon's "no expiry" sentinel. The
			// CapabilityForm leaves `expiryDate === null` when the user picks
			// the "Never" toggle — pass `0` straight through.
			let expiresAt: number;
			if (input.expiryDate === null) {
				expiresAt = 0;
			} else {
				expiresAt = Date.parse(input.expiryDate);
				if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
					const message = "Expiry date must be a valid date in the future.";
					setAddError(message);
					throw new Error(message);
				}
			}
			try {
				await issue.mutateAsync({
					spaceId,
					targetPeerId: input.peerId,
					expiresAt,
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				setAddError(message);
				throw error;
			}
		},
		[issue, spaceId],
	);

	return {
		bots,
		isLoading: listQuery.isLoading || listQuery.isFetching,
		loadError: listQuery.error
			? listQuery.error instanceof Error
				? listQuery.error.message
				: String(listQuery.error)
			: null,
		addBot,
		isAdding: issue.isLoading,
		addError,
		clearAddError: () => setAddError(null),
	};
}

/**
 * Map a daemon `SpaceMember` row onto the `@soma/ui` `Bot` shape the
 * Bots tab renders. Without the capability-record schema extension
 * (cutover doc follow-up), every listed bot is treated as `active` —
 * the daemon doesn't yet emit per-bot status events. `alias` falls
 * back to a `bot:<peer-prefix>` placeholder so `@bot:<alias>` mentions
 * have *something* to anchor to until the schema lands.
 */
function toBot(member: { peerId: string; expiresAt: number }): Bot {
	const peerId = member.peerId;
	const aliasPrefix = peerId.slice(-6).toLowerCase() || "bot";
	const status: BotStatus = "active";
	return {
		id: peerId,
		alias: `bot-${aliasPrefix}`,
		peerId,
		status,
	};
}
