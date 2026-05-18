import type { Decorator, Preview } from "@storybook/react";
import { MotionConfig } from "motion/react";
// biome-ignore lint/correctness/noUnusedImports: required by Storybook preview's classic JSX runtime
import React, { useEffect } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { DensityProvider } from "../src/components/primitives/density-provider";
import { SomaIntlProvider } from "../src/i18n/intl-provider";
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
		</MotionConfig>
	);
};

// Apply the DaisyUI theme requested by the story (defaults to `cmyk`).
// Sets `data-theme` on the document root so semantic colors resolve correctly.
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
	parameters: {
		controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
		// No hardcoded dark default — `bg-base-100` (theme-driven) carries the
		// canvas. Stories that need explicit theming set `parameters.theme`.
		backgrounds: { disable: true },
		// Default DaisyUI theme. Set `parameters: { theme: 'luxury' }` per-story
		// for explicit dark-mode coverage.
		theme: "cmyk",
	},
	decorators: [
		(Story, context) => (
			<SomaIntlProvider>
				<DensityProvider
					density={
						(context.parameters?.density as
							| "dense"
							| "cozy"
							| "oversized"
							| undefined) ?? "dense"
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
