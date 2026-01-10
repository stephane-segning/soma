import * as documentsService from "@soma/services/documents-service.ts";
import { type LoaderFunctionArgs, redirect } from "react-router";

async function loader({ params }: LoaderFunctionArgs): Promise<Response> {
	const spaceId = params.spaceId ?? "";
	if (!spaceId) {
		return redirect("/spaces");
	}

	const data = await documentsService.listPages({ spaceId });
	const pageId = data?.[0]?.pageId;
	if (!pageId) {
		return redirect(`/spaces/${spaceId}`);
	}

	return redirect(`/spaces/${spaceId}/pages/${pageId}`);
}

function Component() {
	return <>Maiou</>;
}

export { Component, loader };
