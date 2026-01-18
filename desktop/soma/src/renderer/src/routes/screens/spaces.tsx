import * as spacesService from "@app/services/spaces-service.ts";
import { redirect } from "react-router";

async function loader(): Promise<Response> {
	const data = await spacesService.listSpaces();
	const all = data?.spaces ?? [];
	const spaceId = all?.[0]?.spaceId;

	if (!spaceId) {
		return Response.json("");
	}

	return redirect(`/spaces/${spaceId}`);
}

function Component() {
	return null;
}

export { Component, loader };
