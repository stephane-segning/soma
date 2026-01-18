import { api, type SpaceMember } from "@app/store/api";

const useSpacesQuery = api.useListSpacesQuery;
const useSpaceQuery = (spaceId: string) =>
	api.useGetSpaceQuery(spaceId, { skip: !spaceId });
const useSpaceMembersQuery = (spaceId: string) =>
	api.useListSpaceMembersQuery(spaceId, { skip: !spaceId });

function useCreateSpaceMutation() {
	const [mutate, state] = api.useCreateSpaceMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: Parameters<typeof mutate>[0]) =>
			mutate(input).unwrap(),
	};
}

function useUpdateSpaceMutation() {
	const [mutate, state] = api.useUpdateSpaceMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: Parameters<typeof mutate>[0]) =>
			mutate(input).unwrap(),
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

export {
	useSpacesQuery,
	useCreateSpaceMutation,
	useUpdateSpaceMutation,
	useDeleteSpaceMutation,
	useSpaceQuery,
	useSpaceMembersQuery,
};
export type { SpaceMember };
