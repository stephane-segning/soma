import { redirect } from "react-router";

function isSpacePageRoute(route: string): boolean {
	return /^\/spaces\/[^/]+\/pages\/[^/]+/.test(route);
}

async function loader(): Promise<Response> {
	try {
		const lastRoute = await window.api.getLastRoute();
		if (typeof lastRoute === "string" && isSpacePageRoute(lastRoute)) {
			return redirect(lastRoute);
		}
	} catch {
		// ignore
	}

	return redirect("/spaces/landing");
}

function Component(): null {
	return null;
}

export { Component, loader };

