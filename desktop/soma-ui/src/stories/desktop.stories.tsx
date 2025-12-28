import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";
import {
	Calendar,
	Cpu,
	Disc,
	Folder,
	MessageCircle,
	Play,
	Zap,
} from "react-feather";
import { useLocation } from "react-router";
import { PolymorphButton } from "../components/actions/polymorph-button";
import { LauncherCard } from "../components/cards/launcher-card";
import { DesktopArea } from "../components/layout/desktop-area";
import { DesktopShell } from "../components/layout/desktop-shell";
import { Dock } from "../components/layout/dock";
import { SplitPane } from "../components/layout/split-pane";
import { Taskbar } from "../components/layout/taskbar";
import { AuroraWallpaper } from "../components/layout/wallpaper";
import { WindowChrome } from "../components/layout/window-chrome";
import { Modal } from "../components/overlays/modal";
import { notify } from "../components/overlays/toast";
import { PresenceStack } from "../components/presence/presence-stack";
import { StatusBadge } from "../components/presence/status-badge";
import { TimerPill } from "../components/progress/streak-meter";
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
	{
		id: "notes",
		label: "Notes",
		hint: "Workspace docs",
		icon: <Folder size={18} />,
	},
	{
		id: "music",
		label: "Synth Lab",
		hint: "Sound toys",
		icon: <Disc size={18} />,
	},
	{
		id: "chat",
		label: "Messages",
		hint: "DMs + mentions",
		icon: <MessageCircle size={18} />,
	},
	{
		id: "energy",
		label: "Energy",
		hint: "System status",
		icon: <Zap size={18} />,
	},
];

const initialApps: RunningApp[] = [
	{
		id: "notes",
		title: "Notes",
		icon: <Folder size={16} />,
		status: "running",
	},
	{
		id: "chat",
		title: "Messages",
		icon: <MessageCircle size={16} />,
		status: "attention",
		badge: "3",
	},
	{
		id: "music",
		title: "Synth Lab",
		icon: <Disc size={16} />,
		status: "sleeping",
	},
];

export const Default: Story = {
	render: function DesktopStory() {
		const [icons, setIcons] = useState(initialIcons);
		const [apps, setApps] = useState(initialApps);
		const [startOpen, setStartOpen] = useState(false);
		const [activeAppId, setActiveAppId] = useState<string | undefined>(
			initialApps[0]?.id,
		);
		const [showModal, setShowModal] = useState(false);

		const location = useLocation();
		const tray = useMemo(
			() => (
				<div className="flex items-center gap-2 text-base-content/70 text-xs">
					<div className="badge badge-outline gap-1 border-base-300/80 bg-base-100/60">
						<Calendar size={12} />
						Today
					</div>
					<div className="badge badge-outline border-base-300/80 bg-base-100/60">
						14:32
					</div>
				</div>
			),
			[],
		);

		return (
			<DesktopShell
				dock={
					<Dock
						activeAppId={activeAppId}
						apps={apps}
						onSelectApp={(appId) => setActiveAppId(appId)}
					/>
				}
				leftColumn={
					<div className="space-y-3">
						<LauncherCard
							badge="active"
							description="Spaces and docs"
							icon={<Folder size={14} />}
							title="Workspace"
						/>
						<LauncherCard
							description="Audio + media lab"
							icon={<Disc size={14} />}
							title="Studio"
						/>
						<LauncherCard
							description="DMs and activity"
							icon={<MessageCircle size={14} />}
							title="Messages"
						/>
						<div className="surface-card p-4">
							<div className="flex items-center justify-between">
								<div className="font-semibold text-sm">You</div>
								<StatusBadge label="Online" tone="success" />
							</div>
							<p className="mt-2 text-base-content/60 text-xs">
								Path: {location.pathname}
							</p>
						</div>
					</div>
				}
				overlays={
					<Modal
						description="This modal mimics a native overlay."
						onClose={() => setShowModal(false)}
						open={showModal}
						title="App opened"
					/>
				}
				rightColumn={
					<div className="space-y-3">
						<div className="surface-card space-y-3 p-4">
							<div className="flex items-center justify-between">
								<h3 className="font-semibold text-sm">Now playing</h3>
								<TimerPill label="Session" timecode="14:32" />
							</div>
							<div className="flex items-center gap-3 rounded-xl bg-base-200/60 p-3">
								<Disc className="text-primary" size={18} />
								<div className="flex-1">
									<div className="font-semibold text-sm">Parallel Dreams</div>
									<div className="text-base-content/60 text-xs">Soma Sound</div>
								</div>
								<PolymorphButton
									leadingIcon={<Play size={14} />}
									size="sm"
									variant="ghost"
								>
									Play
								</PolymorphButton>
							</div>
						</div>
						<div className="surface-card space-y-3 p-4">
							<h3 className="font-semibold text-sm">Presence</h3>
							<PresenceStack
								avatars={[
									{ id: "1", label: "SA", indicator: "online" },
									{ id: "2", label: "JR", indicator: "away" },
									{ id: "3", label: "TP", indicator: "online" },
								]}
							/>
							<div className="flex flex-wrap gap-2 text-base-content/70 text-xs">
								<StatusBadge label="Latency 12ms" tone="success" />
								<StatusBadge label="Agent connected" tone="info" />
								<StatusBadge label="Storage 58% free" tone="muted" />
							</div>
						</div>
					</div>
				}
				taskbar={
					<Taskbar
						activeAppId={activeAppId}
						apps={apps}
						onSelectApp={(appId) => setActiveAppId(appId)}
						onStart={() => setStartOpen((state) => !state)}
						startOpen={startOpen}
						tray={tray}
					/>
				}
				wallpaper={<AuroraWallpaper />}
			>
				<div className="space-y-4">
					<WindowChrome
						actions={
							<PolymorphButton
								leadingIcon={<Zap size={14} />}
								onClick={() => notify.success("Summoned a quick toast")}
								size="sm"
								variant="outline"
							>
								Command
							</PolymorphButton>
						}
						status="online"
						subtitle="libp2p · synced"
						title="Soma OS shell"
					/>
					<SplitPane
						initialSize={70}
						left={
							<DesktopArea
								className="min-h-[420px]"
								emptyHint="No icons yet. Right-click to add shortcuts."
								items={icons}
								onActivate={(item) => {
									setShowModal(true);
									setActiveAppId(item.id);
									if (!apps.find((app) => app.id === item.id)) {
										setApps((prev) => [
											...prev,
											{
												id: item.id,
												title: item.label,
												icon: item.icon ?? <Cpu size={16} />,
											},
										]);
									}
								}}
								onReorder={(next) => setIcons(next)}
							/>
						}
						orientation="horizontal"
						right={
							<div className="space-y-3 rounded-2xl bg-base-100/60 p-4">
								<div className="flex items-center justify-between">
									<p className="font-semibold text-sm">Quick actions</p>
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
								<div className="text-base-content/60 text-xs">
									Drag icons, right-click for context menus, or launch commands
									from the chrome.
								</div>
							</div>
						}
					/>
				</div>
			</DesktopShell>
		);
	},
};
