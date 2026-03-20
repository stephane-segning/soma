import path from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
	stories: ["../src/**/*.stories.@(ts|tsx)"],
	addons: [
		"@storybook/addon-links",
		"@storybook/addon-essentials",
		"@storybook/addon-interactions",
	],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	docs: {
		autodocs: "tag",
	},
	async viteFinal(config) {
		config.resolve = config.resolve || {};
		config.resolve.alias = {
			...(config.resolve.alias || {}),
			"@soma/editor": path.resolve(__dirname, "../src"),
			"@soma/editor/*": path.resolve(__dirname, "../src/*"),
			"@soma/ui": path.resolve(__dirname, "../../desktop-ui/src"),
			"@soma/ui/*": path.resolve(__dirname, "../../desktop-ui/src/*"),
		};

		return config;
	},
};

export default config;
