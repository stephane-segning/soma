import type { Meta, StoryObj } from "@storybook/react";
import { DesktopGuardRail } from "../components/layout/desktop-guard-rail";

const meta: Meta<typeof DesktopGuardRail> = {
	title: "Layout/DesktopGuardRail",
	component: DesktopGuardRail,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DesktopGuardRail>;

export const Normal: Story = {
	render: () => (
		<div className="h-40 rounded-xl border border-base-300 bg-base-100">
			<DesktopGuardRail>
				<div className="flex h-full items-center justify-center text-base-content/70 text-sm">
					App content renders here
				</div>
			</DesktopGuardRail>
		</div>
	),
};

export const Loading: Story = {
	render: () => (
		<div className="h-40 rounded-xl border border-base-300 bg-base-100">
			<DesktopGuardRail isLoading>
				<div>This never renders while loading</div>
			</DesktopGuardRail>
		</div>
	),
};

export const LoadingCustomContent: Story = {
	render: () => (
		<div className="h-40 rounded-xl border border-base-300 bg-base-100">
			<DesktopGuardRail
				isLoading
				loadingContent={
					<div className="flex flex-col items-center gap-2">
						<span className="loading loading-spinner loading-sm" />
						<span className="text-base-content/60 text-xs">
							Connecting to space…
						</span>
					</div>
				}
			>
				<div>hidden</div>
			</DesktopGuardRail>
		</div>
	),
};

export const Blocked: Story = {
	render: () => (
		<div className="h-40 rounded-xl border border-base-300 bg-base-100">
			<DesktopGuardRail isBlocked>
				<div>This never renders while blocked</div>
			</DesktopGuardRail>
		</div>
	),
};

export const BlockedCustomContent: Story = {
	render: () => (
		<div className="h-40 rounded-xl border border-base-300 bg-base-100">
			<DesktopGuardRail
				blockedContent={
					<div className="space-y-1 text-center">
						<div className="font-semibold text-error">Access denied</div>
						<div className="text-base-content/60 text-xs">
							You do not have permission to view this space.
						</div>
					</div>
				}
				isBlocked
			>
				<div>hidden</div>
			</DesktopGuardRail>
		</div>
	),
};
