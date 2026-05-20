import type { Meta, StoryObj } from "@storybook/react";
import { DesktopShell } from "../components/layout/desktop-shell";
import { BasicRender } from "./desktop-shell/basic";
import { SomaAppRender } from "./desktop-shell/soma-app";
import {
	HeaderFooterRender,
	PersistentWidthsRender,
	ScrollableRender,
	SidebarRender,
} from "./desktop-shell/variants";

const meta: Meta<typeof DesktopShell> = {
	title: "Desktop/Shell",
	component: DesktopShell,
	parameters: {
		layout: "fullscreen",
	},
};

export default meta;
type Story = StoryObj<typeof DesktopShell>;

// SomaApp is the flagship preview — assembles the whole library into the
// shape of the real Soma renderer. Keep it first so it's the default
// story when opening the Desktop/Shell folder in Storybook.
export const SomaApp: Story = { render: SomaAppRender };
export const Basic: Story = { render: BasicRender };
export const WithSidebars: Story = { render: SidebarRender };
export const WithHeaderAndFooter: Story = { render: HeaderFooterRender };
export const ScrollableContent: Story = { render: ScrollableRender };
export const PersistentWidths: Story = { render: PersistentWidthsRender };
