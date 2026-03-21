import * as spacesService from "@app/services/spaces-service.ts";
import { redirect } from "react-router";
import { resolveSpacesEntryPath } from "./spaces-entry";

async function loader(): Promise<Response> {
	const data = await spacesService.listSpaces();
	return redirect(resolveSpacesEntryPath(data?.spaces ?? []));
}

function Component() {
	return null;
}

export { Component, loader };
