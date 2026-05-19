import { api, type DecideJoinResult, type JoinRequestRecord, type SpaceMember } from "@app/store/api";

const useSpacesQuery = api.useListSpacesQuery;
const useSpaceQuery = (spaceId: string) =>
	api.useGetSpaceQuery(spaceId, {
		skip: !spaceId,
	});
const useSpaceMembersQuery = (spaceId: string) =>
	api.useListSpaceMembersQuery(spaceId, {
		skip: !spaceId,
	});
const useSpaceBotsQuery = (spaceId: string) =>
	api.useListSpaceBotsQuery(spaceId, {
		skip: !spaceId,
	});
const useMyMembershipsQuery = api.useListMyMembershipsQuery;
const useJoinRequestsQuery = api.useListJoinRequestsQuery;

function useCreateSpaceMutation() {
	const [mutate, state] = api.useCreateSpaceMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: Parameters<typeof mutate>[0]) => mutate(input).unwrap(),
	};
}

function useUpdateSpaceMutation() {
	const [mutate, state] = api.useUpdateSpaceMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: Parameters<typeof mutate>[0]) => mutate(input).unwrap(),
	};
}

function useDeleteSpaceMutation() {
	const [mutate, state] = api.useDeleteSpaceMutation();
	return {
		...state,
		mutate,
		mutateAsync: (spaceId: string) => mutate(spaceId).unwrap(),
	};
}

function useJoinSpaceMutation() {
	const [mutate, state] = api.useJoinSpaceMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: {
			spaceId: string;
			targetPeerId: string;
			targetMultiaddrs: string[];
			displayName?: string;
			deviceName?: string;
		}) => mutate(input).unwrap(),
	};
}

function useDecideJoinMutation() {
	const [mutate, state] = api.useDecideJoinMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: { requestId: string; approve: boolean; role?: string; reason?: string }) =>
			mutate(input).unwrap() as Promise<DecideJoinResult | null>,
	};
}

function useRevokeMembershipMutation() {
	const [mutate, state] = api.useRevokeMembershipMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: { spaceId: string; subjectPeerId: string; reason?: string }) => mutate(input).unwrap(),
	};
}

function useIssueIssuerCapabilityMutation() {
	const [mutate, state] = api.useIssueIssuerCapabilityMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: {
			spaceId: string;
			targetPeerId: string;
			expiresAt: number;
			alias?: string | null;
			scopes?: string[];
		}) => mutate(input).unwrap(),
	};
}

export {
	useCreateSpaceMutation,
	useDecideJoinMutation,
	useUpdateSpaceMutation,
	useDeleteSpaceMutation,
	useIssueIssuerCapabilityMutation,
	useJoinRequestsQuery,
	useJoinSpaceMutation,
	useMyMembershipsQuery,
	useRevokeMembershipMutation,
	useSpaceQuery,
	useSpaceBotsQuery,
	useSpaceMembersQuery,
	useSpacesQuery,
};
export type { DecideJoinResult, JoinRequestRecord, SpaceMember };
