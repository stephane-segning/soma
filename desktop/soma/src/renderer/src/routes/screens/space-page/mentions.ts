import type { MentionProvider } from "@soma/editor";
import { useMemo } from "react";
import { UNTITLED_PAGE_TITLE } from "../page-title";
import * as documentsService from "../../../services/documents-service";
import * as spacesService from "../../../services/spaces-service";

export function usePageMentionProviders(spaceId: string): MentionProvider[] {
	return useMemo<MentionProvider[]>(() => {
		const peerMention: MentionProvider = {
			name: "peerMention",
			char: "@",
			placeholder: "Mention a peer",
			items: async (query) => {
				const members = await spacesService.listSpaceMembers(spaceId);
				const trimmed = query.trim().toLowerCase();
				return members
					.filter((member) => (trimmed ? member.peerId.toLowerCase().includes(trimmed) : true))
					.map((member) => ({
						id: member.peerId,
						label: member.peerId,
						detail: member.role,
						href: `/spaces/${spaceId}/members?peerId=${member.peerId}`,
					}));
			},
		};

		const spaceMention: MentionProvider = {
			name: "spaceMention",
			char: "%",
			placeholder: "Mention a space",
			items: async (query) => {
				const result = await spacesService.listSpaces({ query });
				return result.spaces.map((space) => ({
					id: space.spaceId,
					label: space.displayName || space.spaceId,
					detail: space.spaceId,
					href: `/spaces/${space.spaceId}`,
				}));
			},
		};

		const pageMention: MentionProvider = {
			name: "pageMention",
			char: "#",
			placeholder: "Mention a page",
			items: async (query) => {
				const pages = await documentsService.listPages({ spaceId });
				const trimmed = query.trim().toLowerCase();
				return pages
					.filter((page) => {
						if (!trimmed) return true;
						const title = (page.title ?? "").toLowerCase();
						return title.includes(trimmed) || page.pageId.toLowerCase().includes(trimmed);
					})
					.map((page) => ({
						id: page.pageId,
						label: page.title || UNTITLED_PAGE_TITLE,
						detail: page.pageId,
						href: `/spaces/${spaceId}/pages/${page.pageId}`,
					}));
			},
		};

		return [peerMention, spaceMention, pageMention];
	}, [spaceId]);
}
