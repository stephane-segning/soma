import * as documentsService from "@app/services/documents-service.ts";
import {
	type LoaderFunctionArgs,
	redirect,
} from "react-router";

async function loader({
	params,
}: LoaderFunctionArgs): Promise<Response> {
	const spaceId =
		params.spaceId ??
		"";
	if (
		!spaceId
	) {
		return redirect(
			"/spaces",
		);
	}

	const data =
		await documentsService.listPages(
			{
				spaceId,
			},
		);

	let pageId =
		data?.[0]
			?.pageId;
	if (
		!pageId
	) {
		const record =
			await documentsService.ensurePage(
				{
					spaceId,
				},
			);
		pageId =
			record.pageId;
	}

	return redirect(
		`/spaces/${spaceId}/pages/${pageId}`,
	);
}

function Component() {
	return null;
}

export {
	Component,
	loader,
};
