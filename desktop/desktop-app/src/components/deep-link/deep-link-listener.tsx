/**
 * DeepLinkListener — mounted once, globally, at the React root (see
 * `main.tsx`, next to `CommandPaletteRoot`). Subscribes to
 * `backend.events.onDeepLink` for the whole app's lifetime.
 *
 * Must live here, NOT inside a route component: the OS can hand the app
 * a `soma://invite/...` link at any time, including before the user has
 * navigated anywhere in particular — there is no route that's
 * guaranteed to be mounted when it arrives. `CommandPaletteRoot` faces
 * the identical problem for palette navigation and solves it the same
 * way: mounted as a sibling of `<RouterProvider />`, driving the router
 * imperatively via the `router` singleton rather than `useNavigate()`.
 *
 * All the actual decision logic (which route an invite link goes to,
 * what to do with an unrecognized one) lives in the framework-free
 * `lib/deep-link.ts` so it's unit-testable without mounting this
 * component or a router.
 */
import { useEffect } from "react";
import { backend } from "../../lib/backend";
import { resolveDeepLinkAction } from "../../lib/deep-link";
import { router } from "../../routes/router";

export function DeepLinkListener() {
	useEffect(() => {
		return backend.events.onDeepLink((route) => {
			const action = resolveDeepLinkAction(route);
			if (action.kind === "navigate") {
				void router.navigate(action.path, { state: action.state });
			} else {
				// Never silently dropped, even though there's nowhere useful
				// to route an unrecognized `soma://...` URL.
				console.warn("[deep-link] unrecognized route:", action.url);
			}
		});
	}, []);

	return null;
}
