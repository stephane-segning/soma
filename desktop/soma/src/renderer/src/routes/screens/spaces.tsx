import * as spacesService from "@app/services/spaces-service.ts";
import { redirect } from "react-router";
import { resolveSpacesEntryPath } from "./spaces-entry";

async function loader(): Promise<Response> {
	try {
		const data = await spacesService.listSpaces();
		return redirect(resolveSpacesEntryPath(data?.spaces ?? []));
	} catch {
		return redirect("/settings");
	}
}

function Component() {
	return null;
}

export { Component, loader };
