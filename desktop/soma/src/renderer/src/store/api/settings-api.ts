import * as settingsService from "../../services/settings-service";
import { baseApi } from "./api-base";

export const settingsApi = baseApi.injectEndpoints({
	endpoints: (builder) => ({
		getSetting: builder.query<unknown, string>({
			queryFn: async (key) => {
				try {
					const data = await settingsService.getSetting(key);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, key) => [
				{
					type: "Settings",
					id: key,
				},
			],
		}),
		setSetting: builder.mutation<
			void,
			{
				key: string;
				value: unknown;
			}
		>({
			queryFn: async ({ key, value }) => {
				try {
					await settingsService.setSetting(key, value);
					return { data: undefined };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, { key }) => [
				{
					type: "Settings",
					id: key,
				},
			],
		}),
	}),
});
