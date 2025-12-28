import type { Decorator, Preview } from "@storybook/react";
import { MotionConfig } from "motion/react";
import React from "react";
import { Toaster } from "react-hot-toast";
import { createMemoryRouter, RouterProvider } from "react-router";
import "../src/styles.css";

const withMemoryRouter: Decorator = (Story, context) => {
	const initialEntries = context.parameters?.router?.initialEntries ??
		context.parameters?.router?.path ?? ["/"];

	const router = createMemoryRouter(
		[
			{
				path: "*",
				element: <Story />,
			},
		],
		{
			initialEntries: Array.isArray(initialEntries)
				? initialEntries
				: [initialEntries],
		},
	);

	return (
		<MotionConfig reducedMotion="user">
			<RouterProvider router={router} />
			<Toaster
				containerClassName="z-[70]"
				position="bottom-right"
				toastOptions={{
					className:
						"bg-base-100 text-base-content shadow-xl border border-base-300",
					style: { padding: "12px 14px", borderRadius: "12px" },
					success: { iconTheme: { primary: "#22c55e", secondary: "#ffffff" } },
					error: { iconTheme: { primary: "#ef4444", secondary: "#ffffff" } },
				}}
			/>
		</MotionConfig>
	);
};

const preview: Preview = {
	parameters: {
		controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
		backgrounds: {
			default: "Soma surface",
			values: [
				{ name: "Soma surface", value: "#0f172a" },
				{ name: "Paper", value: "#f8fafc" },
			],
		},
	},
	decorators: [withMemoryRouter],
};

export default preview;
