import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";
import {
	Activity,
	Bold,
	Italic,
	Link as LinkIcon,
	MessageCircle,
	Shield,
	Zap,
} from "react-feather";
import { CommandPalette } from "../components/overlays/command-palette";
import { BubbleToolbar } from "../components/overlays/bubble-toolbar";
import { NotificationDrawer } from "../components/overlays/notification-drawer";
import { WindowChrome } from "../components/layout/window-chrome";
import { SplitPane } from "../components/layout/split-pane";
import { PolymorphButton } from "../components/actions/polymorph-button";
import { LauncherCard } from "../components/cards/launcher-card";
import { PresenceStack } from "../components/presence/presence-stack";
import { ShortcutRow } from "../components/primitives/shortcut-row";
import {
	StreakMeter,
	TimerPill,
	XpMeter,
} from "../components/progress/streak-meter";
import { RosterItem } from "../components/lists/roster-item";

const meta: Meta = {
	title: "Showcase/UI Suite",
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const Suite: Story = {
	render: function SuiteStory() {
		const [paletteOpen, setPaletteOpen] = useState(false);
		const [drawerOpen, setDrawerOpen] = useState(true);
		const commands = useMemo(
			() => [
				{
					id: "new-doc",
					title: "New document",
					subtitle: "Create in current space",
					shortcut: "⌘N",
					icon: <Activity size={14} />,
					group: "Actions",
				},
				{
					id: "invite",
					title: "Invite peer",
					subtitle: "Send join link",
					icon: <Shield size={14} />,
					group: "Spaces",
				},
				{
					id: "message",
					title: "Open messages",
					subtitle: "Jump to inbox",
					icon: <MessageCircle size={14} />,
					group: "Navigation",
				},
			],
			[],
		);

		return (
			<div className="min-h-screen bg-base-200 p-6">
				<div className="mx-auto max-w-6xl space-y-6">
					<WindowChrome
						title="Soma Workspace"
						subtitle="libp2p · synced"
						status="online"
						actions={
							<PolymorphButton
								size="sm"
								variant="outline"
								leadingIcon={<Zap size={14} />}
								onClick={() => setPaletteOpen(true)}
							>
								Command
							</PolymorphButton>
						}
					/>

					<SplitPane
						orientation="horizontal"
						left={
							<div className="space-y-3 p-3">
								<LauncherCard
									title="Open Soma"
									description="Desktop workspace"
									icon={<Zap size={16} />}
									badge="active"
								/>
								<LauncherCard
									title="Tapia practice"
									description="Keyboard drills and scoring"
									icon={<MessageCircle size={16} />}
									badge="beta"
								/>
								<RosterItem
									id="r1"
									title="Dr. Rivera"
									subtitle="Owner · expires in 30d"
									role="Owner"
									status="approved"
								/>
								<RosterItem
									id="r2"
									title="Join requests"
									subtitle="Awaiting review"
									status="pending"
								/>
							</div>
						}
						right={
							<div className="space-y-3 p-3">
								<div className="flex flex-wrap items-center gap-3">
									<PresenceStack
										avatars={[
											{ id: "1", label: "SA", indicator: "online" },
											{ id: "2", label: "JR", indicator: "away" },
											{ id: "3", label: "TP", indicator: "online" },
										]}
									/>
									<TimerPill timecode="24:16" label="Session" />
								</div>
								<div className="grid gap-3 md:grid-cols-2">
									<StreakMeter value={5} />
									<XpMeter value={420} max={800} />
								</div>
								<div className="space-y-2">
									<ShortcutRow label="Command palette" keys={["⌘", "K"]} />
									<ShortcutRow label="Toggle mute" keys={["⇧", "M"]} />
								</div>
							</div>
						}
					/>
				</div>

				<CommandPalette
					open={paletteOpen}
					onOpen={() => setPaletteOpen(true)}
					onClose={() => setPaletteOpen(false)}
					items={commands}
				/>

				<BubbleToolbar
					open
					anchor={{ x: 420, y: 360 }}
					actions={[
						{
							id: "bold",
							icon: <Bold size={14} />,
							label: "Bold",
							active: true,
						},
						{ id: "italic", icon: <Italic size={14} />, label: "Italic" },
						{ id: "link", icon: <LinkIcon size={14} />, label: "Link" },
					]}
				/>

				<NotificationDrawer
					open={drawerOpen}
					onClose={() => setDrawerOpen(false)}
					items={[
						{
							id: "1",
							title: "New join request",
							body: "Tapia is requesting to join Space Alpha",
							time: "just now",
						},
						{
							id: "2",
							title: "Blob cached",
							body: "Fetched cid Qm123 from peer",
							time: "2m ago",
						},
					]}
				/>
			</div>
		);
	},
};
