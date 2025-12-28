import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";
import { Calendar, Cpu, Disc, Folder, MessageCircle, Play, Zap } from "react-feather";
import { useLocation } from "react-router";
import { DesktopArea } from "../components/layout/desktop-area";
import { DesktopShell } from "../components/layout/desktop-shell";
import { Dock } from "../components/layout/dock";
import { Taskbar } from "../components/layout/taskbar";
import { AuroraWallpaper } from "../components/layout/wallpaper";
import { WindowChrome } from "../components/layout/window-chrome";
import { SplitPane } from "../components/layout/split-pane";
import { PolymorphButton } from "../components/actions/polymorph-button";
import { LauncherCard } from "../components/cards/launcher-card";
import { PresenceStack } from "../components/presence/presence-stack";
import { TimerPill } from "../components/progress/streak-meter";
import { StatusBadge } from "../components/presence/status-badge";
import { Modal } from "../components/overlays/modal";
import { notify } from "../components/overlays/toast";
import type { DesktopIcon, RunningApp } from "../types";

const meta: Meta<typeof DesktopShell> = {
	title: "Desktop/Shell",
	component: DesktopShell,
	parameters: {
		layout: "fullscreen",
	},
};

export default meta;
type Story = StoryObj<typeof DesktopShell>;

const initialIcons: DesktopIcon[] = [
	{ id: "notes", label: "Notes", hint: "Workspace docs", icon: <Folder size={18} /> },
	{ id: "music", label: "Synth Lab", hint: "Sound toys", icon: <Disc size={18} /> },
	{ id: "chat", label: "Messages", hint: "DMs + mentions", icon: <MessageCircle size={18} /> },
	{ id: "energy", label: "Energy", hint: "System status", icon: <Zap size={18} /> },
];

const initialApps: RunningApp[] = [
	{ id: "notes", title: "Notes", icon: <Folder size={16} />, status: "running" },
	{ id: "chat", title: "Messages", icon: <MessageCircle size={16} />, status: "attention", badge: "3" },
	{ id: "music", title: "Synth Lab", icon: <Disc size={16} />, status: "sleeping" },
];

export const Default: Story = {
	render: function DesktopStory() {
		const [icons, setIcons] = useState(initialIcons);
		const [apps, setApps] = useState(initialApps);
		const [startOpen, setStartOpen] = useState(false);
		const [activeAppId, setActiveAppId] = useState<string | undefined>(initialApps[0]?.id);
		const [showModal, setShowModal] = useState(false);

		const location = useLocation();
		const tray = useMemo(
			() => (
				<div className="flex items-center gap-2 text-xs text-base-content/70">
					<div className="badge badge-outline gap-1 border-base-300/80 bg-base-100/60">
						<Calendar size={12} />
						Today
					</div>
					<div className="badge badge-outline border-base-300/80 bg-base-100/60">14:32</div>
				</div>
			),
			[],
		);

		return (
			<DesktopShell
				wallpaper={<AuroraWallpaper />}
				leftColumn={
					<div className="space-y-3">
						<LauncherCard title="Workspace" description="Spaces and docs" icon={<Folder size={14} />} badge="active" />
						<LauncherCard title="Studio" description="Audio + media lab" icon={<Disc size={14} />} />
						<LauncherCard title="Messages" description="DMs and activity" icon={<MessageCircle size={14} />} />
						<div className="surface-card p-4">
							<div className="flex items-center justify-between">
								<div className="text-sm font-semibold">You</div>
								<StatusBadge label="Online" tone="success" />
							</div>
							<p className="mt-2 text-xs text-base-content/60">Path: {location.pathname}</p>
						</div>
					</div>
				}
				rightColumn={
					<div className="space-y-3">
						<div className="surface-card space-y-3 p-4">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-semibold">Now playing</h3>
								<TimerPill timecode="14:32" label="Session" />
							</div>
							<div className="flex items-center gap-3 rounded-xl bg-base-200/60 p-3">
								<Disc size={18} className="text-primary" />
								<div className="flex-1">
									<div className="text-sm font-semibold">Parallel Dreams</div>
									<div className="text-xs text-base-content/60">Soma Sound</div>
								</div>
								<PolymorphButton variant="ghost" size="sm" leadingIcon={<Play size={14} />}>
									Play
								</PolymorphButton>
							</div>
						</div>
						<div className="surface-card space-y-3 p-4">
							<h3 className="text-sm font-semibold">Presence</h3>
							<PresenceStack
								avatars={[
									{ id: "1", label: "SA", indicator: "online" },
									{ id: "2", label: "JR", indicator: "away" },
									{ id: "3", label: "TP", indicator: "online" },
								]}
							/>
							<div className="flex flex-wrap gap-2 text-xs text-base-content/70">
								<StatusBadge label="Latency 12ms" tone="success" />
								<StatusBadge label="Agent connected" tone="info" />
								<StatusBadge label="Storage 58% free" tone="muted" />
							</div>
						</div>
					</div>
				}
				taskbar={
					<Taskbar
						apps={apps}
						activeAppId={activeAppId}
						tray={tray}
						startOpen={startOpen}
						onStart={() => setStartOpen((state) => !state)}
						onSelectApp={(appId) => setActiveAppId(appId)}
					/>
				}
				dock={<Dock apps={apps} activeAppId={activeAppId} onSelectApp={(appId) => setActiveAppId(appId)} />}
				overlays={<Modal open={showModal} title="App opened" description="This modal mimics a native overlay." onClose={() => setShowModal(false)} />}
			>
				<div className="space-y-4">
					<WindowChrome
						title="Soma OS shell"
						subtitle="libp2p · synced"
						status="online"
						actions={
							<PolymorphButton size="sm" variant="outline" onClick={() => notify.success("Summoned a quick toast")} leadingIcon={<Zap size={14} />}>
								Command
							</PolymorphButton>
						}
					/>
					<SplitPane
						orientation="horizontal"
						initialSize={70}
						left={
							<DesktopArea
								items={icons}
								onReorder={(next) => setIcons(next)}
								onActivate={(item) => {
									setShowModal(true);
									setActiveAppId(item.id);
									if (!apps.find((app) => app.id === item.id)) {
										setApps((prev) => [
											...prev,
											{ id: item.id, title: item.label, icon: item.icon ?? <Cpu size={16} /> },
										]);
									}
								}}
								emptyHint="No icons yet. Right-click to add shortcuts."
								className="min-h-[420px]"
							/>
						}
						right={
							<div className="space-y-3 rounded-2xl bg-base-100/60 p-4">
								<div className="flex items-center justify-between">
									<p className="text-sm font-semibold">Quick actions</p>
									<StatusBadge label="Live" tone="success" />
								</div>
								<div className="flex flex-wrap gap-2">
									<PolymorphButton size="sm" variant="primary">
										New doc
									</PolymorphButton>
									<PolymorphButton size="sm" variant="secondary">
										Invite peer
									</PolymorphButton>
									<PolymorphButton size="sm" variant="ghost">
										Settings
									</PolymorphButton>
								</div>
								<div className="text-xs text-base-content/60">
									Drag icons, right-click for context menus, or launch commands from the chrome.
								</div>
							</div>
						}
					/>
				</div>
			</DesktopShell>
		);
	},
};
