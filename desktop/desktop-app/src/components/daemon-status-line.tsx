/**
 * DaemonStatusLine — quiet inline indicator for the embedded daemon's boot
 * state. Renders nothing once the daemon is ready (the common case, and
 * normally reached in well under a second); while it's still starting or
 * has failed, this is the *only* thing telling the user why every
 * daemon-backed action (create a space, open an invite, chat, …) is
 * silently doing nothing.
 *
 * This exists because of a real regression: `DaemonRuntime::start()`
 * could get stuck forever with no bounded failure and no readiness state
 * anywhere the UI could reach — the shell looked completely normal while
 * every backend-touching feature quietly no-op'd. The Rust side now
 * guarantees `start()` always resolves within `STARTUP_TIMEOUT`
 * (`desktop-daemon/src/runtime.rs`); this component is the other half —
 * an inline status line (per AGENTS.md's UI philosophy: empty/waiting
 * states are inline, not a centered placard or a toast) rather than
 * nothing.
 *
 * Polls `daemon.isReady()` at a slow cadence — this is a boot-time
 * signal, not a live status widget — and stops for good once ready (the
 * daemon doesn't go back down without an explicit `daemon.control(
 * "stop")`, which nothing in this app calls today).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { backend } from "../lib/backend";

const POLL_INTERVAL_MS = 1_500;
/** Below this, render nothing — most boots clear in well under a second,
 *  and a status line that flashes for 300ms is worse than no line at all. */
const GRACE_PERIOD_MS = 1_200;

type Phase = { kind: "hidden" } | { kind: "starting" } | { kind: "failed"; message: string };

export function DaemonStatusLine(): React.JSX.Element | null {
	const { t } = useTranslation();
	const [phase, setPhase] = useState<Phase>({ kind: "hidden" });
	const [retrying, setRetrying] = useState(false);
	const bootAtRef = useRef(Date.now());

	const poll = useCallback(async () => {
		try {
			const ready = await backend.daemon.isReady();
			if (ready) {
				setPhase({ kind: "hidden" });
				return true;
			}
			const status = await backend.daemon.status();
			if (status.error) {
				setPhase({ kind: "failed", message: status.error });
			} else if (Date.now() - bootAtRef.current > GRACE_PERIOD_MS) {
				setPhase({ kind: "starting" });
			}
			return false;
		} catch (err) {
			setPhase({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
			return false;
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		async function tick() {
			const ready = await poll();
			if (cancelled || ready) return;
			timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
		}
		void tick();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [poll]);

	const handleRetry = useCallback(() => {
		setRetrying(true);
		(async () => {
			try {
				await backend.daemon.control("start");
			} finally {
				await poll();
				setRetrying(false);
			}
		})();
	}, [poll]);

	if (phase.kind === "hidden") return null;
	const isError = phase.kind === "failed";

	return (
		<output
			className={`flex items-center gap-2 border-b px-3 py-1.5 text-xs ${
				isError ? "border-error/30 bg-error/10 text-error" : "border-base-300 bg-base-200/60 text-base-content/70"
			}`}
		>
			<span aria-hidden className="relative flex size-1.5 shrink-0">
				{!isError && (
					<span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
				)}
				<span className="relative inline-flex size-1.5 rounded-full bg-current" />
			</span>
			<span className="min-w-0 flex-1 truncate">
				{isError
					? t("app.daemonUnavailable", "Backend unavailable: {{message}}", { message: phase.message })
					: t("app.daemonStarting", "Starting backend…")}
			</span>
			{isError && (
				<button
					className="shrink-0 rounded border border-current/30 px-2 py-0.5 font-medium hover:bg-error/10 disabled:opacity-50"
					disabled={retrying}
					onClick={handleRetry}
					type="button"
				>
					{t("app.daemonRetry", "Retry")}
				</button>
			)}
		</output>
	);
}
