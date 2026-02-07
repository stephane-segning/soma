import type { Space } from "@app/services/spaces-service.ts";
import * as spacesService from "@app/services/spaces-service.ts";
import { type LoaderFunctionArgs, Outlet, redirect } from "react-router";

type LoaderData = Space | never;

async function loader({ params }: LoaderFunctionArgs): Promise<LoaderData> {
	const spaceId = params.spaceId?.trim() ?? "";
	if (!spaceId) {
		throw redirect("/spaces");
	}

	try {
		return await spacesService.getSpace(spaceId);
	} catch {
		throw redirect("/spaces/landing");
	}
}

function Component() {
	return <Outlet />;
}

export { Component, loader };
