/**
 * useSpaceBots — renderer hook that backs the Bots tab in space
 * settings.
 *
 * Wired through:
 *  - **bots list** — `useListSpaceBotsQuery` calls
 *    `spaces_list_bots` → `DaemonClient.listSpaceBots` → napi
 *    `SomaHandle.listSpaceBots` → `DaemonHandle::list_space_bots`,
 *    which reads from the issuer-capability store (same place the
 *    add flow writes to).
 *  - **addBot** — calls `spaces_issue_issuer_capability` IPC →
 *    `DaemonClient.issueIssuerCapability` → napi
 *    `SomaHandle.issueIssuerCapability`. The form's `peerId`,
 *    `alias`, and `expiryDate` map onto `targetPeerId`, `alias`,
 *    and `expiresAt` (epoch-ms).
 *
 * Open follow-ups (per ui-revamp-v0-cutover-status):
 *  - **scopeIds** from the form are still not propagated — the
 *    daemon's capability schema doesn't yet carry granular scope
 *    grants. The form still captures them so the local UX is
 *    complete; they wait on the next schema bump.
 *  - **status** — there's no bot status event stream yet. Every
 *    listed bot is reported as `active`; a `pending`/`failed` split
 *    waits on daemon event plumbing.
 */
import { useIssueIssuerCapabilityMutation, useSpaceBotsQuery } from "@app/queries/spaces";
import type { SpaceBot } from "@app/services/spaces-service";
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
			// Trim the alias and collapse empty strings to null so the daemon
			// boundary never receives whitespace-only labels. The Rust side
			// also normalises, but we keep the wire clean.
			const alias = input.alias.trim() ? input.alias.trim() : null;
			try {
				await issue.mutateAsync({
					spaceId,
					targetPeerId: input.peerId,
					expiresAt,
					alias,
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
 * Map a daemon `SpaceBot` row onto the `@soma/ui` `Bot` shape the
 * Bots tab renders.
 *
 * - `alias` comes from the operator-typed value in the Add form. If
 *   the user left it blank (or the row predates the alias column),
 *   we fall back to `bot-<lowercased-last-6-of-peerId>` so the
 *   `@bot:<alias>` mention path always has something to anchor to.
 * - `status` is forwarded from the daemon. `expired` is derived
 *   server-side from `expires_at`; `pending`/`failed` flow from the
 *   handshake protocol (foundation in this PR; transitions land in a
 *   follow-up).
 */
function toBot(bot: SpaceBot): Bot {
	const peerId = bot.peerId;
	const fallbackAliasSuffix = peerId.slice(-6).toLowerCase() || "bot";
	const alias = bot.alias?.trim() ? bot.alias.trim() : `bot-${fallbackAliasSuffix}`;
	const status: BotStatus = bot.status;
	return {
		id: peerId,
		alias,
		peerId,
		status,
	};
}
