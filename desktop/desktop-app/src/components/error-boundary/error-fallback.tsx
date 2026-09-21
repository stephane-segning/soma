/**
 * ErrorFallback — shared presentational recovery screen for both
 * `RouteErrorBoundary` (react-router's per-route `errorElement`) and
 * `AppErrorBoundary` (a plain React class boundary for the handful of
 * things mounted outside the router).
 *
 * Never silent: the caller always logs the raw error via
 * `console.error` first (see both boundary components), and this
 * screen keeps the message — plus the stack, behind a `<details>`
 * toggle — visible so a crash stays debuggable without opening
 * devtools. This *is* the inline error surface (there's no other
 * content on screen to render an error next to), so it doesn't route
 * through the toast system — ADR-0005 §6 is about not using toasts
 * *instead of* inline feedback, and a full recovery screen already is
 * that.
 *
 * `variant`:
 *  - `"route"` — a single route crashed; `AppLayout`'s shell (rails,
 *    header) is still mounted around this, so "Back to Spaces" is a
 *    real, working recovery action.
 *  - `"fatal"` — the crash is in `AppLayout` itself, or entirely
 *    outside the router. No shell survives to navigate within (re-
 *    rendering the same broken tree would just throw again), so the
 *    only honest recovery action is a hard reload.
 */
import { Empty } from "@soma/ui/components/primitives/empty";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export type ErrorFallbackProps = {
	error: unknown;
	variant: "route" | "fatal";
};

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message || error.name;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function errorStack(error: unknown): string | null {
	return error instanceof Error && typeof error.stack === "string" ? error.stack : null;
}

export function ErrorFallback({ error, variant }: ErrorFallbackProps) {
	const { t } = useTranslation();
	const message = errorMessage(error);
	const stack = errorStack(error);
	const isFatal = variant === "fatal";

	return (
		<main className="mx-auto flex w-full max-w-2xl flex-col items-center px-8 py-16">
			<Empty
				cta={
					isFatal ? (
						<button className="btn btn-primary btn-sm" onClick={() => window.location.reload()} type="button">
							{t("errors.fatal.cta")}
						</button>
					) : (
						<Link className="btn btn-primary btn-sm" to="/spaces">
							{t("errors.route.cta")}
						</Link>
					)
				}
				headline={isFatal ? t("errors.fatal.headline") : t("errors.route.headline")}
				subtext={
					<span className="flex flex-col items-center gap-2">
						<span>{isFatal ? t("errors.fatal.subtext") : t("errors.route.subtext")}</span>
						<span className="font-mono text-error text-xs">{message}</span>
						{stack ? (
							<details className="mt-1 w-full max-w-lg text-left">
								<summary className="cursor-pointer text-base-content/50 text-xs">{t("errors.details")}</summary>
								<pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-base-content/60">
									{stack}
								</pre>
							</details>
						) : null}
					</span>
				}
			/>
		</main>
	);
}
