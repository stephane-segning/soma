import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import { recentPagesActions, saveToStorage } from "./recent-pages";

/**
 * Listener middleware that persists the recent-pages slice to
 * localStorage after each `recordPageOpened` action. Keeping the
 * persistence side-effect out of the reducer preserves reducer
 * purity (see ADR + gemini review on PR #100).
 */
const recentPagesListenerMiddleware = createListenerMiddleware();

recentPagesListenerMiddleware.startListening({
	matcher: isAnyOf(recentPagesActions.recordPageOpened),
	effect: (_action, api) => {
		const state = api.getState() as {
			recentPages: { entries: Parameters<typeof saveToStorage>[0] };
		};
		saveToStorage(state.recentPages.entries);
	},
});

export { recentPagesListenerMiddleware };
