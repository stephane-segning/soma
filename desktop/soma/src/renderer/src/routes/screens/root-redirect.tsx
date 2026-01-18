import { redirect } from "react-router";

function loader(): Response {
	return redirect(
		"/spaces",
	);
}

function Component(): null {
	return null;
}

export {
	Component,
	loader,
};
