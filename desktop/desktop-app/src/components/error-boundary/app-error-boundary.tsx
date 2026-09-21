/**
 * AppErrorBoundary — last-resort boundary for the handful of things
 * mounted OUTSIDE the router tree (`CommandPaletteRoot` and the
 * shell/command-palette providers in `main.tsx`) that react-router's
 * per-route `errorElement`s (see `RouteErrorBoundary`) can never see,
 * because they're siblings of `<RouterProvider>`, not descendants of
 * any route. A crash here has no shell left to recover into — same
 * situation as the root route's own `errorElement` — so it always
 * renders the `"fatal"` fallback (hard reload).
 *
 * Has to be a class component: `getDerivedStateFromError` /
 * `componentDidCatch` are the only React error-boundary hooks, and
 * neither has a function-component equivalent.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorFallback } from "./error-fallback";

type Props = { children: ReactNode };
type State = { error: unknown };

export class AppErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: unknown): State {
		return { error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		// Never swallow silently — this is the outermost net, so it's the
		// last chance to get the crash into the console for debugging.
		console.error("[app-error-boundary]", error, errorInfo.componentStack);
	}

	render(): ReactNode {
		if (this.state.error !== null) {
			return <ErrorFallback error={this.state.error} variant="fatal" />;
		}
		return this.props.children;
	}
}
