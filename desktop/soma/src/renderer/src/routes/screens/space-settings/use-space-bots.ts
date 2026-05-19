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
 *  - **scopeIds** from the form are propagated end-to-end through
 *    storage → daemon → napi → IPC → RTK → this hook. Runtime
 *    enforcement landed: `membership::ensure_can_issue_membership`
 *    rejects capabilities whose non-empty scopes don't include
 *    `"issue:membership"`. Empty scopes remain unrestricted (backward
 *    compat). The only recognised v0 scope is `"issue:membership"`;
 *    the free-text form field accepts any string but only that value
 *    will be honoured by the daemon today.
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
	retryBot: (bot: Bot) => Promise<void>;
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
			// `expiresAt = 0` is the daemon's "Never" sentinel. The
			// CapabilityForm leaves `expiryDate === null` when the user picks
			// the "Never" toggle — pass `0` straight through.
			//
			// The daemon translates `0` to `now + 180 days` server-side
			// (`MAX_ISSUER_CAPABILITY_LIFETIME_SECS`). A future UI refinement
			// should hint "Expires in up to 180 days" near the toggle so the
			// operator isn't surprised by the bounded lifetime.
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
					scopes: input.scopeIds,
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

	const retryBot = useCallback(
		async (bot: Bot) => {
			if (!spaceId) {
				const message = "No space is selected; cannot retry capability.";
				setAddError(message);
				throw new Error(message);
			}
			setAddError(null);
			// Re-run the same mutation with the bot's original peerId and alias.
			// `expiresAt = 0` is the "no expiry" sentinel — retries always drop
			// the expiry so the operator doesn't accidentally issue a capability
			// that immediately re-expires. The storage upsert resets the row to
			// `pending` and the Rust-side `update_status WHERE status = 'pending'`
			// gating ensures stale events from the prior attempt become no-ops.
			//
			// Look up the underlying daemon row by peerId so we send the
			// *original* alias — not the UI fallback `bot-<suffix>` that
			// `toBot` synthesises when the stored alias is null/empty. Without
			// this lookup, retry would promote the fallback to a permanent
			// alias in the capability store.
			const originalRow = (listQuery.data ?? []).find(
				(row) => row.peerId === bot.peerId,
			);
			const sourceAlias = originalRow
				? (originalRow.alias ?? "")
				: bot.alias;
			const alias = sourceAlias.trim() ? sourceAlias.trim() : null;
			try {
				await issue.mutateAsync({
					spaceId,
					targetPeerId: bot.peerId,
					expiresAt: 0,
					alias,
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				setAddError(message);
				throw error;
			}
		},
		[issue, listQuery.data, spaceId],
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
		retryBot,
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
 *   server-side from `expires_at` on each `list_space_bots` call;
 *   `pending`/`failed` flow from the handshake protocol (foundation
 *   in this PR; transitions land in a follow-up).
 * - `errorReason` — the daemon doesn't yet carry a structured reason
 *   on the capability row, but the `BotList` `FailureRow` (and its
 *   Retry button) only renders when this string is truthy. Synthesise
 *   a generic message for failed rows so the operator can re-issue;
 *   a real per-failure message lands when the handshake protocol
 *   surfaces a reason on the row.
 *
 * Client-side safety net: if the Bots tab is open across an expiry
 * without any RTK cache invalidation, the snapshot we have here may
 * still say `"active"` even though the wall clock has moved past
 * `expiresAt`. Re-apply the same predicate the daemon uses so the row
 * flips to `expired` without waiting for a refetch. Idempotent with
 * the server-side derivation — both compute the same thing. The
 * proper push-based fix is the bot-status event stream (next PR in
 * the cutover-status thread).
 */
function toBot(bot: SpaceBot): Bot {
	const peerId = bot.peerId;
	const fallbackAliasSuffix = peerId.slice(-6).toLowerCase() || "bot";
	const alias = bot.alias?.trim() ? bot.alias.trim() : `bot-${fallbackAliasSuffix}`;
	const status: BotStatus = clientDerivedStatus(bot);
	return {
		id: peerId,
		alias,
		peerId,
		status,
		errorReason: status === "failed" ? GENERIC_FAILURE_REASON : undefined,
	};
}

/**
 * Generic fallback reason for failed handshake rows. The daemon-side
 * capability row doesn't yet carry a structured reason — when the
 * handshake protocol surfaces one (`PeerEvent::IssuerNackReceived`
 * etc.), this branch swaps to that.
 */
const GENERIC_FAILURE_REASON = "Handshake did not complete.";

function clientDerivedStatus(bot: SpaceBot): BotStatus {
	// `expiresAt` is daemon-side epoch seconds (matches the existing
	// renderer convention everywhere else — see `space-members.tsx`,
	// `use-membership-settings.tsx`, `use-space-access-settings.tsx`).
	const expiresAtMs = bot.expiresAt > 0 ? bot.expiresAt * 1000 : 0;
	if (bot.status === "active" && expiresAtMs > 0 && expiresAtMs <= Date.now()) {
		return "expired";
	}
	return bot.status;
}
