import type { Meta, StoryObj } from "@storybook/react";
import { DesktopShell } from "../components/layout/desktop-shell";
import { BasicRender } from "./desktop-shell/basic";
import { HeaderFooterRender, PersistentWidthsRender, ScrollableRender, SidebarRender } from "./desktop-shell/variants";

const meta: Meta<typeof DesktopShell> = {
	title: "Desktop/Shell",
	component: DesktopShell,
	parameters: {
		layout: "fullscreen",
	},
};

export default meta;
type Story = StoryObj<typeof DesktopShell>;

export const Basic: Story = { render: BasicRender };
export const WithSidebars: Story = { render: SidebarRender };
export const WithHeaderAndFooter: Story = { render: HeaderFooterRender };
export const ScrollableContent: Story = { render: ScrollableRender };
export const PersistentWidths: Story = { render: PersistentWidthsRender };
