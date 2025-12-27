import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as spacesService from "../services/spaces-service";

function useSpacesQuery() {
	return useQuery({
		queryKey: ["spaces"] as const,
		queryFn: async () => {
			console.log("one.1:");
			const res = await spacesService.listSpaces().catch((err) => {
				console.error(`one.3: ${err?.message}`, err);
				throw err;
			});
			console.log("one.2:", res);
			return res;
		},
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

export {
	useSpacesQuery,
	useCreateSpaceMutation,
	useUpdateSpaceMutation,
	useDeleteSpaceMutation,
	useSpaceQuery,
};
