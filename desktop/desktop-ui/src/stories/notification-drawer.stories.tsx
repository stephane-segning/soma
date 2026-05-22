import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Bell, CheckCircle, Zap } from "react-feather";
import { PolymorphButton } from "../components/actions/polymorph-button";
import { NotificationDrawer } from "../components/overlays/notification-drawer";
import type { NotificationItem } from "../components/overlays/notification-drawer";

const meta: Meta<typeof NotificationDrawer> = {
	title: "Overlays/NotificationDrawer",
	component: NotificationDrawer,
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof NotificationDrawer>;

const SAMPLE_ITEMS: NotificationItem[] = [
	{
		id: "n1",
		title: "Sync completed",
		body: "All documents are up to date with the latest changes.",
		icon: <CheckCircle size={14} />,
		time: "2m ago",
	},
	{
		id: "n2",
		title: "New bot available",
		body: "The Tapia assistant bot is ready to connect.",
		icon: <Zap size={14} />,
		time: "15m ago",
	},
	{
		id: "n3",
		title: "Space joined",
		body: "You joined the Engineering space successfully.",
		icon: <Bell size={14} />,
		time: "1h ago",
	},
];

export const WithNotifications: Story = {
	render: function DrawerStory() {
		const [open, setOpen] = useState(true);
		return (
			<div className="relative h-screen bg-base-200">
				<div className="p-6">
					<PolymorphButton
						leadingIcon={<Bell size={14} />}
						onClick={() => setOpen(true)}
						variant="primary"
					>
						Open drawer
					</PolymorphButton>
				</div>
				<NotificationDrawer
					items={SAMPLE_ITEMS}
					onClose={() => setOpen(false)}
					open={open}
				/>
			</div>
		);
	},
};

export const Empty: Story = {
	render: function EmptyStory() {
		const [open, setOpen] = useState(true);
		return (
			<div className="relative h-screen bg-base-200">
				<div className="p-6">
					<PolymorphButton onClick={() => setOpen(true)} variant="secondary">
						Open empty drawer
					</PolymorphButton>
				</div>
				<NotificationDrawer
					items={[]}
					onClose={() => setOpen(false)}
					open={open}
				/>
			</div>
		);
	},
};

export const CustomTitle: Story = {
	render: function TitleStory() {
		const [open, setOpen] = useState(true);
		return (
			<div className="relative h-screen bg-base-200">
				<div className="p-6">
					<PolymorphButton onClick={() => setOpen(true)} variant="secondary">
						Open
					</PolymorphButton>
				</div>
				<NotificationDrawer
					items={SAMPLE_ITEMS.slice(0, 1)}
					onClose={() => setOpen(false)}
					open={open}
					title="Activity"
				/>
			</div>
		);
	},
};

export const Closed: Story = {
	render: function ClosedStory() {
		return (
			<div className="h-screen bg-base-200 p-6">
				<p className="text-base-content/60 text-sm">Drawer is closed.</p>
				<NotificationDrawer items={SAMPLE_ITEMS} open={false} />
			</div>
		);
	},
};
