import type { Meta, StoryObj } from "@storybook/react";
import { CheckCircle, Info, Menu, Sliders } from "react-feather";
import { DesktopShell } from "../components/layout/desktop-shell";
import { StatusBadge } from "../components/presence/status-badge";

const meta: Meta<typeof DesktopShell> = {
	title: "Desktop/Shell",
	component: DesktopShell,
	parameters: {
		layout: "fullscreen",
	},
};

export default meta;
type Story = StoryObj<typeof DesktopShell>;

export const Basic: Story = {
	render: function BasicStory() {
		return (
			<DesktopShell>
				<div className="space-y-2">
					<h1 className="font-semibold text-xl">Basic layout</h1>
					<p className="text-base-content/70 text-sm">
						Use DesktopShell to wrap desktop screens with consistent padding and
						max width.
					</p>
				</div>
			</DesktopShell>
		);
	},
};

export const WithSidebars: Story = {
	render: function SidebarStory() {
		return (
			<DesktopShell
				header={({ toggleLeft, toggleRight }) => (
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<button
								aria-label="Toggle navigation"
								className="btn btn-ghost btn-xs btn-circle"
								onClick={toggleLeft}
								type="button"
							>
								<Menu size={14} />
							</button>
							<button
								aria-label="Toggle status"
								className="btn btn-ghost btn-xs btn-circle"
								onClick={toggleRight}
								type="button"
							>
								<Info size={14} />
							</button>
							<h1 className="font-semibold text-2xl">Desktop Shell</h1>
						</div>
						<p className="text-base-content/70 text-sm">
							A simple structured layout for desktop screens with optional
							sidebars.
						</p>
					</div>
				)}
				leftColumn={
					<div className="space-y-3 text-sm">
						<p className="font-semibold text-base-content/80">Navigation</p>
						<ul className="space-y-2 text-base-content/70">
							<li>Overview</li>
							<li>Work</li>
							<li>Messages</li>
						</ul>
					</div>
				}
				rightColumn={
					<div className="space-y-3 text-sm">
						<p className="font-semibold text-base-content/80">Status</p>
						<div className="space-y-2 text-base-content/70">
							<StatusBadge label="Online" tone="success" />
							<StatusBadge label="Syncing" tone="info" />
						</div>
						<div className="flex items-start gap-2 rounded-lg bg-base-200/60 p-3 text-base-content/70 text-xs">
							<Info className="text-base-content/60" size={14} />
							<span>
								Use this shell as a structured layout for desktop views.
							</span>
						</div>
					</div>
				}
			>
				<div className="rounded-xl border border-base-300/60 bg-base-100/80 p-4">
					<h2 className="font-semibold text-lg">Primary content</h2>
					<p className="text-base-content/70 text-sm">
						Use sidebars for navigation and status. Main content stays in the
						center column.
					</p>
				</div>
			</DesktopShell>
		);
	},
};

export const WithHeaderAndFooter: Story = {
	render: function HeaderFooterStory() {
		return (
			<DesktopShell
				footer={
					<div className="flex items-center gap-3 rounded-lg border border-base-300/60 bg-base-100/80 p-3 text-base-content/80 text-sm">
						<CheckCircle className="text-success" size={16} />
						<span>All systems nominal. Last updated moments ago.</span>
					</div>
				}
				header={({ toggleLeft, toggleRight }) => (
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<button
								aria-label="Toggle menu"
								className="btn btn-ghost btn-xs rounded-full"
								onClick={toggleLeft}
								type="button"
							>
								<Menu size={14} />
							</button>
							<button
								aria-label="Toggle controls"
								className="btn btn-ghost btn-xs rounded-full"
								onClick={toggleRight}
								type="button"
							>
								<Info size={14} />
							</button>
							<h1 className="font-semibold text-2xl">Dashboard</h1>
						</div>
						<p className="text-base-content/70 text-sm">
							Summary view with optional footer actions.
						</p>
					</div>
				)}
				leftColumn={
					<div className="space-y-2 text-sm">
						<p className="font-semibold text-base-content/80">Menu</p>
						<div className="flex items-center gap-2 rounded-lg border border-base-300/60 bg-base-100/80 p-2 text-base-content/70">
							<Menu size={14} />
							<span>Toggle me</span>
						</div>
					</div>
				}
				rightColumn={
					<div className="space-y-2 text-sm">
						<p className="font-semibold text-base-content/80">Controls</p>
						<div className="flex items-center gap-2 rounded-lg border border-base-300/60 bg-base-100/80 p-2 text-base-content/70">
							<Sliders size={14} />
							<span>Resize with drag handle</span>
						</div>
					</div>
				}
			>
				<div className="rounded-xl border border-base-300/60 bg-base-100/80 p-4">
					<p className="text-base-content/80 text-sm">
						This variant shows how to add a header and footer while keeping the
						content area simple.
					</p>
				</div>
			</DesktopShell>
		);
	},
};
