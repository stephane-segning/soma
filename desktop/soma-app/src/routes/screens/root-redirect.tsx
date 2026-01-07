import { redirect } from "react-router";

function loader(): Response {
	return redirect("/spaces/landing");
}

function Component(): null {
	return null;
}

export { Component, loader };
