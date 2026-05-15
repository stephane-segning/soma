import type { LoaderFunctionArgs } from "react-router";
import { normalizePageTitle } from "../page-title";
import * as documentsService from "../../../services/documents-service";
import type { LoaderData } from "./types";

export async function loader({ params }: LoaderFunctionArgs): Promise<LoaderData> {
	const spaceId = params.spaceId ?? "";
	const pageId = params.pageId ?? "";
	if (!spaceId || !pageId) {
		throw new Response("Missing space or page", {
			status: 400,
		});
	}

	const pages = await documentsService.listPages({ spaceId });
	const page = pages.find((candidate) => candidate.pageId === pageId);
	if (!page) {
		throw new Response("Page not found", {
			status: 404,
		});
	}

	const draft = await documentsService.getDraft({
		spaceId,
		documentId: pageId,
	});

	return {
		spaceId,
		pageId,
		pageTitle: normalizePageTitle(page.title),
		initialContentJson: draft?.contentJson ?? null,
	};
}
