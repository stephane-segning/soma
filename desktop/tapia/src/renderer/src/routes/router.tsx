import { isRoutingRecord, ROUTING_RECORD_ID } from "@soma/desktop-db";
import { createHashRouter, Navigate } from "react-router";
import { AppLayout } from "../app";
import { routingCollection } from "../lib/db";
import { DEFAULT_SPACE_ID } from "./constants";
import ExerciseDetail from "./screens/exercise-detail";
import Exercises from "./screens/exercises";
import NotFound from "./screens/not-found";

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
