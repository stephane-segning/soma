import { useCallback, useEffect, useState } from "react";
import * as daemonService from "../../../services/daemon-service";

export function DaemonSection(): React.JSX.Element {
	const [daemonStatus, setDaemonStatus] = useState<daemonService.DaemonRuntimeStatus | null>(null);
	const [daemonMessage, setDaemonMessage] = useState<string | null>(null);
	const [isDaemonBusy, setIsDaemonBusy] = useState(false);

	const refreshDaemonStatus = useCallback(async () => {
		try {
			const status = await daemonService.getDaemonStatus();
			setDaemonStatus(status);
			setDaemonMessage(status.reachable ? null : (status.error ?? "Daemon is not reachable."));
		} catch (error) {
			setDaemonStatus(null);
			setDaemonMessage(error instanceof Error ? error.message : String(error));
		}
	}, []);

	useEffect(() => {
		void refreshDaemonStatus();
	}, [refreshDaemonStatus]);

	const runDaemonAction = useCallback(async (action: daemonService.DaemonControlAction) => {
		setIsDaemonBusy(true);
		setDaemonMessage(null);
		try {
			const result = await daemonService.controlDaemon(action);
			setDaemonStatus(result.status);
			setDaemonMessage(result.message ?? (result.ok ? `Daemon ${action} completed.` : `Daemon ${action} failed.`));
		} catch (error) {
			setDaemonMessage(error instanceof Error ? error.message : String(error));
		} finally {
			setIsDaemonBusy(false);
		}
	}, []);

	return (
		<div className="card border border-base-300 bg-base-100">
			<div className="card-body space-y-4">
				<DaemonHeader reachable={daemonStatus?.reachable === true} />
				{daemonMessage ? <div className="rounded-lg bg-base-200 px-3 py-2 text-sm">{daemonMessage}</div> : null}
				<div className="grid gap-3 md:grid-cols-3">
					<DaemonSocketCard status={daemonStatus} />
					<DaemonPeerCard status={daemonStatus} />
					<DaemonControlCard busy={isDaemonBusy} onAction={runDaemonAction} onRefresh={refreshDaemonStatus} />
				</div>
			</div>
		</div>
	);
}

function DaemonHeader({ reachable }: { reachable: boolean }): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 className="card-title text-base">Local daemon</h2>
				<p className="text-base-content/70 text-sm">
					Soma can open without the daemon, but spaces, pages, memberships, and attachments need it to be reachable.
				</p>
			</div>
			<div className={reachable ? "badge badge-success" : "badge badge-warning"}>
				{reachable ? "Reachable" : "Unavailable"}
			</div>
		</div>
	);
}

function DaemonSocketCard({ status }: { status: daemonService.DaemonRuntimeStatus | null }): React.JSX.Element {
	const socketText = status?.socket?.exists
		? status.socket.ownedByCurrentUser === false
			? "Socket exists but is not owned by this user"
			: "Socket exists"
		: "Socket missing";

	return <DaemonInfoCard detail={socketText} label="Socket" mono title={status?.socketPath ?? "Unknown"} />;
}

function DaemonPeerCard({ status }: { status: daemonService.DaemonRuntimeStatus | null }): React.JSX.Element {
	return (
		<DaemonInfoCard
			detail={`${status?.listenAddrs.length ?? 0} listen addresses`}
			label="Peer"
			title={status?.peerId ?? "Not connected"}
			truncate
		/>
	);
}

function DaemonControlCard({
	busy,
	onAction,
	onRefresh,
}: {
	busy: boolean;
	onAction: (action: daemonService.DaemonControlAction) => Promise<void>;
	onRefresh: () => Promise<void>;
}): React.JSX.Element {
	return (
		<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
			<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">Control</div>
			<div className="mt-2 flex flex-wrap gap-2">
				<button className="btn btn-primary btn-xs" disabled={busy} onClick={() => void onAction("start")} type="button">
					Start
				</button>
				<button
					className="btn btn-outline btn-xs"
					disabled={busy}
					onClick={() => void onAction("restart")}
					type="button"
				>
					Restart
				</button>
				<button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void onAction("stop")} type="button">
					Stop
				</button>
				<button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void onRefresh()} type="button">
					Refresh
				</button>
			</div>
		</div>
	);
}

function DaemonInfoCard({
	detail,
	label,
	mono,
	title,
	truncate,
}: {
	detail: string;
	label: string;
	mono?: boolean;
	title: string;
	truncate?: boolean;
}): React.JSX.Element {
	const titleClass = [mono ? "break-all font-mono" : "", truncate ? "truncate font-mono" : "", "mt-1 text-xs"].join(
		" ",
	);
	return (
		<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
			<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">{label}</div>
			<div className={titleClass}>{title}</div>
			<div className="mt-1 text-base-content/70 text-xs">{detail}</div>
		</div>
	);
}
