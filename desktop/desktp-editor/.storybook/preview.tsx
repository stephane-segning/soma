import type { Decorator, Preview } from "@storybook/react";
import React from "react";
import { MotionConfig } from "motion/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import "./storybook.css";

const withMemoryRouter: Decorator = (Story, context) => {
	const initialEntries = context.parameters?.router?.initialEntries ?? context.parameters?.router?.path ?? ["/"];

	const router = createMemoryRouter(
		[
			{
				path: "*",
				element: <Story />,
			},
		],
		{
			initialEntries: Array.isArray(initialEntries) ? initialEntries : [initialEntries],
		},
	);

	return (
		<MotionConfig reducedMotion="user">
			<RouterProvider router={router} />
		</MotionConfig>
	);
};

const preview: Preview = {
	parameters: {
		controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
		backgrounds: {
			default: "Paper",
			values: [
				{ name: "Paper", value: "#f8fafc" },
				{ name: "Soma surface", value: "#0f172a" },
			],
		},
	},
	decorators: [withMemoryRouter],
};

export default preview;
