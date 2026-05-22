import type { Meta, StoryObj } from "@storybook/react";
import { AuroraWallpaper } from "../components/layout/wallpaper";

const meta: Meta<typeof AuroraWallpaper> = {
	title: "Layout/Wallpaper",
	component: AuroraWallpaper,
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AuroraWallpaper>;

export const Default: Story = {
	render: () => (
		<div className="relative h-screen w-full">
			<AuroraWallpaper />
		</div>
	),
};

export const WithContent: Story = {
	render: () => (
		<div className="relative h-screen w-full">
			<AuroraWallpaper />
			<div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 text-center">
				<h1 className="font-bold text-3xl">Desktop</h1>
				<p className="text-base-content/70 text-sm">
					The wallpaper renders behind all desktop content.
				</p>
			</div>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="relative h-screen w-full">
			<AuroraWallpaper />
			<div className="relative z-10 flex h-full items-center justify-center">
				<p className="text-base-content/60 text-sm">Dark theme variant</p>
			</div>
		</div>
	),
};
