import { createHashRouter, Navigate } from "react-router";
import { routingCollection } from "../lib/db";
import { AppLayout } from "../app";
import { DEFAULT_SPACE_ID } from "./constants";
import ExerciseDetail from "./screens/exercise-detail";
import Exercises from "./screens/exercises";
import NotFound from "./screens/not-found";
import { ROUTING_RECORD_ID, isRoutingRecord } from "@soma/desktop-db";

const routingRecord = routingCollection.state.get(ROUTING_RECORD_ID);
const initialPath =
	routingRecord && isRoutingRecord(routingRecord) && routingRecord.lastPath
		? routingRecord.lastPath
		: `/spaces/${DEFAULT_SPACE_ID}/exercises`;

const router = createHashRouter([
	{
		path: "/",
		element: <AppLayout />,
		children: [
			{
				index: true,
				element: <Navigate replace to={initialPath} />,
			},
			{
				path: "spaces/:spaceId/exercises",
				element: <Exercises />,
			},
			{
				path: "spaces/:spaceId/exercises/:exerciseId",
				element: <ExerciseDetail />,
			},
			{
				path: "*",
				element: <NotFound />,
			},
		],
	},
]);

export { router };
