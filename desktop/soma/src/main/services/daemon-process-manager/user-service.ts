import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { ServiceCommandResult } from "./types";

const SERVICE_LABEL = "digital.camer.soma.daemon";
const SYSTEMD_UNIT = "soma-daemon.service";

export function startUserService(): Promise<ServiceCommandResult> {
	if (process.platform === "darwin") return startLaunchAgent();
	if (process.platform === "linux") return runCommand("systemctl", ["--user", "start", SYSTEMD_UNIT]);
	return Promise.resolve({ ok: false, message: `unsupported service platform ${process.platform}` });
}

export function stopUserService(): Promise<ServiceCommandResult> {
	if (process.platform === "darwin") return stopLaunchAgent();
	if (process.platform === "linux") return runCommand("systemctl", ["--user", "stop", SYSTEMD_UNIT]);
	return Promise.resolve({ ok: false, message: `unsupported service platform ${process.platform}` });
}

async function startLaunchAgent(): Promise<ServiceCommandResult> {
	const uid = typeof process.getuid === "function" ? process.getuid() : null;
	if (uid === null) return { ok: false, message: "current uid unavailable" };
	const plist = `/Library/LaunchAgents/${SERVICE_LABEL}.plist`;
	if (!existsSync(plist)) return { ok: false, message: `${plist} not found` };

	const bootstrap = await runCommand("launchctl", ["bootstrap", `gui/${uid}`, plist]);
	if (!bootstrap.ok && !bootstrap.message?.includes("already bootstrapped")) {
		return bootstrap;
	}
	return runCommand("launchctl", ["kickstart", "-k", `gui/${uid}/${SERVICE_LABEL}`]);
}

function stopLaunchAgent(): Promise<ServiceCommandResult> {
	const uid = typeof process.getuid === "function" ? process.getuid() : null;
	if (uid === null) return Promise.resolve({ ok: false, message: "current uid unavailable" });
	const plist = `/Library/LaunchAgents/${SERVICE_LABEL}.plist`;
	if (existsSync(plist)) return runCommand("launchctl", ["bootout", `gui/${uid}`, plist]);
	return runCommand("launchctl", ["bootout", `gui/${uid}/${SERVICE_LABEL}`]);
}

function runCommand(command: string, args: string[]): Promise<ServiceCommandResult> {
	return new Promise((resolveResult) => {
		const child = spawn(command, args, { stdio: "pipe" });
		let stderr = "";
		let stdout = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			resolveResult({ ok: false, message: error.message });
		});
		child.on("close", (code) => {
			resolveResult({
				ok: code === 0,
				message: (stderr || stdout).trim() || undefined,
			});
		});
	});
}
