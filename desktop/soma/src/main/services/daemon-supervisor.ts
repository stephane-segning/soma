import { resolve } from "node:path";
import { app, dialog } from "electron";
import log from "electron-log";
import { inject, injectable } from "inversify";
import { TYPES } from "../tokens";
import type { DaemonClient } from "./daemon-client";

type EnsureOptions = {
	startupTimeoutMs?: number;
};

@injectable()
export class DaemonSupervisor {
	private readonly logger = log.scope("daemon-supervisor");
	private ensureInFlight: Promise<void> | null = null;
	private connected = false;

	constructor(
		@inject(TYPES.daemonClient) private readonly daemon: DaemonClient,
	) {}

	async ensureConnected(options: EnsureOptions = {}): Promise<void> {
		if (this.connected) return;
		if (this.ensureInFlight) return this.ensureInFlight;

		this.ensureInFlight = this.ensureConnectedInner(options);
		try {
			await this.ensureInFlight;
		} finally {
			this.ensureInFlight = null;
		}
	}

	private async ensureConnectedInner(options: EnsureOptions): Promise<void> {
		if (this.connected) return;

		const startupTimeoutMs = options.startupTimeoutMs ?? 15_000;

		const socketPath = this.resolveSocketPath();
		this.daemon.setSocketPath(socketPath);

		const ok = await this.waitForStatus(startupTimeoutMs);
		if (ok) {
			this.logger.info("soma-daemon reachable", { socketPath });
			this.connected = true;
			return;
		}

		this.showConnectHelp(socketPath);
	}

	private resolveSocketPath(): string {
		const fromEnv = process.env.SOMA_DAEMON_SOCKET;
		if (fromEnv && fromEnv.trim()) return fromEnv.trim();

		// Prefer userData for stable writable paths.
		if (app.isReady()) {
			const dir = app.getPath("userData");
			return resolve(dir, "soma-daemon.sock");
		}

		// Dev fallback (works when running from `desktop/`).
		return resolve(process.cwd(), "../../../backend", "soma-daemon.sock");
	}

	private async waitForStatus(timeoutMs: number): Promise<boolean> {
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			try {
				await this.daemon.status();
				return true;
			} catch {
				// not ready yet
			}
			await new Promise((r) => setTimeout(r, 250));
		}
		return false;
	}

	private showConnectHelp(socketPath: string): void {
		this.logger.error(`Unable to connect to soma-daemon at ${socketPath}`);
		void dialog.showMessageBox({
			type: "warning",
			title: "Soma daemon not reachable",
			message: "Soma could not connect to soma-daemon.",
			detail:
				`Socket: ${socketPath}\n\n` +
				"Start soma-daemon manually, or set SOMA_DAEMON_SOCKET to the correct socket path.",
		});
	}
}
