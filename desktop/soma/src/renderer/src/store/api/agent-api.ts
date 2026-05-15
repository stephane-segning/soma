import * as chatService from "../../services/chat-service";
import { searchApi } from "./search-api";

export const api = searchApi.injectEndpoints({
	endpoints: (builder) => ({
		listAgentModels: builder.query<chatService.AgentModel[], string | undefined>({
			queryFn: async (spaceId) => {
				try {
					const data = await chatService.listModels(spaceId);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, spaceId) => [
				{
					type: "AgentModels",
					id: spaceId ?? "GLOBAL",
				},
			],
		}),
		streamChat: builder.mutation<
			null,
			{
				history: chatService.ChatMessage[];
				model?: string;
			}
		>({
			queryFn: async ({ history, model }) => {
				try {
					const result = await chatService.streamChat(history, { model });
					if (result.error) {
						throw new Error(result.error);
					}
					return { data: null };
				} catch (error) {
					return { error };
				}
			},
		}),
	}),
});
