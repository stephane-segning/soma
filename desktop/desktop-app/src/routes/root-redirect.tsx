import { redirect } from "react-router";

export function rootRedirectLoader(): Response {
	return redirect("/spaces");
}
