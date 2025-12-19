import { createHashRouter, RouterProvider } from 'react-router'
import type { RouteObject } from 'react-router'
import App from '../App'

const routes: RouteObject[] = [
	{
		path: '/',
		element: <App />
	}
]

const router = createHashRouter(routes)

function AppRouter(): React.JSX.Element {
	return <RouterProvider router={router} />
}

export { AppRouter }
