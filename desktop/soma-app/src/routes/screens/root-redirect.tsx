import { redirect } from "react-router";
import { getLastRoute } from "../../services/settings-service";

function isSpacePageRoute(route: string): boolean {
	return /^\/spaces\/[^/]+\/pages\/[^/]+/.test(route);
}

async function loader(): Promise<Response> {
	try {
		const lastRoute = await getLastRoute();
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
