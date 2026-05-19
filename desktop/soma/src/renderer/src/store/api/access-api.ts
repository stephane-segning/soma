import * as spacesService from "../../services/spaces-service";
import type { DecideJoinResult, JoinRequestRecord, SpaceMember } from "./api-types";
import { spacesApi } from "./spaces-api";

export const accessApi = spacesApi.injectEndpoints({
	endpoints: (builder) => ({
		listSpaceMembers: builder.query<SpaceMember[], string>({
			queryFn: async (spaceId) => {
				try {
					const data = await spacesService.listSpaceMembers(spaceId);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, spaceId) => [
				{
					type: "SpaceMembers",
					id: spaceId,
				},
			],
		}),
		listSpaceBots: builder.query<SpaceMember[], string>({
			queryFn: async (spaceId) => {
				try {
					const data = await spacesService.listSpaceBots(spaceId);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			// Bot rows are members under the hood — share the `SpaceMembers`
			// cache tag so capability issuance and member revocations both
			// invalidate this query too.
			providesTags: (_result, _error, spaceId) => [
				{
					type: "SpaceMembers",
					id: spaceId,
				},
			],
		}),
		listMyMemberships: builder.query<SpaceMember[], void>({
			queryFn: async () => {
				try {
					const data = await spacesService.listMyMemberships();
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (result) => [
				{
					type: "Memberships",
					id: "LIST",
				},
				...(result ?? []).map((membership) => ({
					type: "SpaceMembers" as const,
					id: membership.spaceId,
				})),
			],
		}),
		joinSpace: builder.mutation<spacesService.JoinSpaceResult, spacesService.JoinSpaceInput>({
			queryFn: async (input) => {
				try {
					const data = await spacesService.joinSpace(input);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: [
				{
					type: "JoinRequests",
					id: "LIST",
				},
			],
		}),
		listJoinRequests: builder.query<JoinRequestRecord[], void>({
			queryFn: async () => {
				try {
					const data = await spacesService.listJoinRequests();
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: [
				{
					type: "JoinRequests",
					id: "LIST",
				},
			],
		}),
		decideJoin: builder.mutation<DecideJoinResult | null, spacesService.DecideJoinInput>({
			queryFn: async (input) => {
				try {
					const data = await spacesService.decideJoin(input);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (result) => [
				{
					type: "JoinRequests",
					id: "LIST",
				},
				{
					type: "Memberships",
					id: "LIST",
				},
				{
					type: "Spaces",
					id: "LIST",
				},
				...(result?.spaceId ? spaceMemberTags(result.spaceId) : []),
			],
		}),
		revokeMembership: builder.mutation<boolean, spacesService.RevokeMembershipInput>({
			queryFn: async (input) => {
				try {
					const data = await spacesService.revokeMembership(input);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, input) => [
				{
					type: "Memberships",
					id: "LIST",
				},
				{
					type: "JoinRequests",
					id: "LIST",
				},
				{
					type: "Spaces",
					id: "LIST",
				},
				...spaceMemberTags(input.spaceId),
			],
		}),
		issueIssuerCapability: builder.mutation<boolean, spacesService.IssueIssuerCapabilityInput>({
			queryFn: async (input) => {
				try {
					const data = await spacesService.issueIssuerCapability(input);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, input) => spaceMemberTags(input.spaceId),
		}),
	}),
});

function spaceMemberTags(spaceId: string) {
	return [
		{
			type: "SpaceMembers" as const,
			id: spaceId,
		},
		{
			type: "Space" as const,
			id: spaceId,
		},
	];
}
