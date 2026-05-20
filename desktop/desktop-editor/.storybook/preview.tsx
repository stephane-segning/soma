import type { Decorator, Preview } from "@storybook/react";
import { DensityProvider } from "@soma/ui/components/primitives/density-provider";
import { SomaIntlProvider } from "@soma/ui/i18n";
import { MotionConfig } from "motion/react";
// biome-ignore lint/correctness/noUnusedImports: required by Storybook preview's classic JSX runtime
import React, { useEffect } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import "@soma/ui/styles.css";
import "./storybook.css";

const withMemoryRouter: Decorator = (Story, context) => {
	const initialEntries =
		context.parameters?.router?.initialEntries ??
		context.parameters?.router?.path ??
		["/"];

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

const withDaisyTheme: Decorator = (Story, context) => {
	const theme = (context.parameters?.theme as string | undefined) ?? "cmyk";
	useEffect(() => {
		const previous = document.documentElement.getAttribute("data-theme");
		document.documentElement.setAttribute("data-theme", theme);
		return () => {
			if (previous == null) {
				document.documentElement.removeAttribute("data-theme");
			} else {
				document.documentElement.setAttribute("data-theme", previous);
			}
		};
	}, [theme]);
	return <Story />;
};

const preview: Preview = {
	tags: ["autodocs"],
	parameters: {
		controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
		backgrounds: {
			default: "Paper",
			values: [
				{ name: "Paper", value: "#f8fafc" },
				{ name: "Soma surface", value: "#0f172a" },
			],
		},
		theme: "cmyk",
	},
	decorators: [
		(Story, context) => (
			<SomaIntlProvider>
				<DensityProvider
					density={
						(context.parameters?.density as "dense" | "cozy" | "oversized" | undefined) ?? "dense"
					}
				>
					<Story />
				</DensityProvider>
			</SomaIntlProvider>
		),
		withDaisyTheme,
		withMemoryRouter,
	],
};

export default preview;
