/**
 * useSpaceBots — renderer hook that backs the Bots tab in space
 * settings.
 *
 * Cutover 1b status:
 *  - **addBot** is now wired end-to-end through `spaces_issue_issuer_capability`
 *    IPC → `DaemonClient.issueIssuerCapability` → napi
 *    `SomaHandle.issueIssuerCapability`. The form's `peerId` +
 *    `expiryDate` map onto `targetPeerId` + `expiresAt` (epoch-ms).
 *  - **bots list** is still empty: the daemon doesn't expose a
 *    `list_space_bots` endpoint yet. The Bots tab's empty state
 *    handles this case. Once the daemon ships the endpoint, this
 *    hook gains a `useListSpaceBotsQuery` call here.
 *  - **alias** and **scopeIds** from the form are not yet propagated
 *    to the daemon — the daemon's capability model doesn't store
 *    aliases or scope grants today. The form still captures them so
 *    the local UX is complete; they wait on a daemon-side schema
 *    extension.
 */
import { useIssueIssuerCapabilityMutation } from "@app/queries/spaces";
import type { Bot } from "@soma/ui/components/lists/bot-list";
import { useCallback, useState } from "react";

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
	const [addError, setAddError] = useState<string | null>(null);

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
		bots: [],
		isLoading: false,
		loadError: null,
		addBot,
		isAdding: issue.isLoading,
		addError,
		clearAddError: () => setAddError(null),
	};
}
