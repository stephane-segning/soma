import { useEffect, useState } from "react";

export type ViewportRect = {
	top: number;
	left: number;
	width: number;
	height: number;
};

/**
 * The screen rect the shell should actually occupy, tracking
 * `window.visualViewport` instead of trusting the shell stays put at
 * `(0, 0)` / full `100vh`-`100dvh`.
 *
 * Why this is a *rect* (`top`/`left` too, not just `height`): iOS/
 * WKWebView's keyboard-focus handling doesn't just shrink the visible
 * area — on focus it can pan the *visual* viewport within the layout
 * viewport (`visualViewport.offsetTop` goes non-zero), which drags
 * everything rendered at the layout viewport's origin — including a
 * `position: sticky` header, which is only sticky relative to a
 * *non-scrolling* ancestor and so behaves like it's glued to literal
 * document `(0, 0)` — up and off-screen, under the status bar/Dynamic
 * Island. This is a known, currently-open WebKit regression on iOS 26
 * (confirmed still misbehaving on offsetTop reset after the keyboard
 * dismisses, e.g. https://developer.apple.com/forums/thread/797097),
 * so the shell can't assume the pan resolves itself — it has to
 * actively re-pin itself to wherever the visual viewport actually is,
 * every time it moves, rather than only reacting to size changes.
 * `DesktopShell` applies this rect via `position: fixed` +
 * `top`/`left`/`width`/`height`, which makes the shell (and everything
 * sticky/absolute inside it) follow the visual viewport exactly instead
 * of drifting with it.
 *
 * Pairs with `desktop-app/src/styles.css` pinning `html`/`body`
 * (`position: fixed`) — that stops the *document* itself from becoming
 * a second, independent scroll surface WebKit could also act on; this
 * hook handles the visual-viewport pan that pinning `body` alone does
 * not prevent on iOS 26.
 *
 * Returns `undefined` wherever `visualViewport` isn't available
 * (older WebKitGTK/WebView2 builds, Storybook's test runner, SSR) —
 * callers fall back to `100dvw`/`100dvh` at `(0, 0)`, which is exactly
 * right there since nothing is panning the viewport to begin with.
 */
export function useViewportRect(): ViewportRect | undefined {
	const [rect, setRect] = useState<ViewportRect | undefined>(() => {
		if (typeof window === "undefined") return undefined;
		const viewport = window.visualViewport;
		if (!viewport) return undefined;
		return {
			top: viewport.offsetTop,
			left: viewport.offsetLeft,
			width: viewport.width,
			height: viewport.height,
		};
	});

	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;

		const update = () => {
			setRect({
				top: viewport.offsetTop,
				left: viewport.offsetLeft,
				width: viewport.width,
				height: viewport.height,
			});
		};
		update();
		// `resize` covers height changes (keyboard show/hide, rotation);
		// `scroll` covers the pan itself (`offsetTop`/`offsetLeft`
		// changing without a size change) — both are needed, see the doc
		// comment above.
		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);
		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
		};
	}, []);

	return rect;
}
