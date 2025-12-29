import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as spacesService from "../services/spaces-service";

type SpaceMember = spacesService.SpaceMember;

function useSpacesQuery() {
	return useQuery({
		queryKey: ["spaces"] as const,
		queryFn: async () => await spacesService.listSpaces(),
	});
}

function useCreateSpaceMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: spacesService.createSpace,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["spaces"] });
		},
	});
}

function useUpdateSpaceMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: spacesService.updateSpace,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["spaces"] });
		},
	});
}

function useDeleteSpaceMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (spaceId: string) => spacesService.deleteSpace(spaceId),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["spaces"] });
		},
	});
}

function useSpaceQuery(spaceId: string) {
	return useQuery({
		queryKey: ["spaces", spaceId] as const,
		queryFn: async () => spacesService.getSpace(spaceId),
		enabled: Boolean(spaceId),
	});
}

function useSpaceMembersQuery(spaceId: string) {
	return useQuery({
		queryKey: ["spaces", spaceId, "members"] as const,
		queryFn: async (): Promise<SpaceMember[]> =>
			spacesService.listSpaceMembers(spaceId),
		enabled: Boolean(spaceId),
	});
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
