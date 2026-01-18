import { createHashRouter, Navigate } from "react-router";
import { AppLayout } from "../app";
import { DEFAULT_SPACE_ID } from "./constants";
import ExerciseDetail from "./screens/exercise-detail";
import Exercises from "./screens/exercises";
import NotFound from "./screens/not-found";

const router = createHashRouter([
	{
		path: "/",
		element: <AppLayout />,
		children: [
			{
				index: true,
				element: (
					<Navigate replace to={`/spaces/${DEFAULT_SPACE_ID}/exercises`} />
				),
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
