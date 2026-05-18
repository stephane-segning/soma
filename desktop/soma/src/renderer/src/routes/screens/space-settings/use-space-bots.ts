/**
 * useSpaceBots — renderer hook that backs the Bots tab in space
 * settings.
 *
 * v0 status: the napi `SomaHandle` exposes `issueIssuerCapability` but
 * NOT `listSpaceBots` yet (see backend gap noted in cutover-1 scope).
 * Until the daemon ships a list endpoint + a bot-status event stream,
 * the hook returns an empty list and dispatches the add-bot flow
 * through the existing `issueIssuerCapability` path.
 *
 * Once the daemon lands `list_space_bots`, only the implementation of
 * this hook changes — the component API (`bots`, `addBot`, etc.) is
 * the contract the UI consumes today.
 */
import { useCallback, useState } from "react";
import type { Bot } from "@soma/ui/components/lists/bot-list";

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

/**
 * @param spaceId — the space the Bots tab is scoped to.
 */
export function useSpaceBots(_spaceId: string | undefined): UseSpaceBotsResult {
	// TODO(cutover-1b): swap the empty list for a real RTK Query call
	// once the daemon exposes `list_space_bots` on `SomaHandle`. The
	// query should also subscribe to the bot-status event stream so
	// the UI updates as handshakes complete.
	const [isAdding, setAdding] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);

	const addBot = useCallback(async (_input: AddBotInput) => {
		setAdding(true);
		setAddError(null);
		try {
			// TODO(cutover-1b): wire the napi `issueIssuerCapability`
			// (already on `SomaHandle`) once a spaces-service IPC method
			// is added in the main process. The renderer surface should
			// translate `AddBotInput` into the
			// `IssueIssuerCapabilityInputJs` shape — peerId, computed
			// `expiresAt` ms (from `expiryDate` or null = far future),
			// and route to the controller.
			await new Promise<void>((resolve) => setTimeout(resolve, 600));
			throw new Error(
				"Bot capability issuance isn't wired through IPC yet. The daemon backend item is tracked in the cutover-1 follow-up.",
			);
		} catch (error) {
			setAddError(error instanceof Error ? error.message : String(error));
			throw error;
		} finally {
			setAdding(false);
		}
	}, []);

	return {
		bots: [],
		isLoading: false,
		loadError: null,
		addBot,
		isAdding,
		addError,
		clearAddError: () => setAddError(null),
	};
}
