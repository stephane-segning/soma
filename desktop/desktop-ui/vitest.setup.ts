import "@testing-library/jest-dom/vitest";
import { setProjectAnnotations } from "@storybook/react";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import * as previewAnnotations from "./.storybook/preview";

// Apply the Storybook preview decorators (IntlProvider, DensityProvider,
// theme, memory router) to every story rendered through `composeStories`.
setProjectAnnotations(previewAnnotations);

afterEach(() => {
	cleanup();
});
