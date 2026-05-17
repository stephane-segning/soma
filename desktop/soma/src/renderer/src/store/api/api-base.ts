import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

export const baseApi = createApi({
	reducerPath: "api",
	baseQuery: fakeBaseQuery(),
	tagTypes: [
		"Settings",
		"Spaces",
		"Space",
		"SpaceMembers",
		"Memberships",
		"JoinRequests",
		"Pages",
		"Draft",
		"Search",
		"AgentModels",
		"PracticeExercises",
		"PracticeLeaderboard",
	],
	endpoints: () => ({}),
});
