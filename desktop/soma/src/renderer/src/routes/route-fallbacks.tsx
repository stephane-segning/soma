import { isRouteErrorResponse, useRouteError } from "react-router";

function RoutePending(): React.JSX.Element {
	return (
		<div className="flex h-full min-h-[12rem] items-center justify-center p-6">
			<div className="text-base-content/70 text-sm">Loading page…</div>
		</div>
	);
}

function formatRouteError(error: unknown): { title: string; detail: string } {
	if (isRouteErrorResponse(error)) {
		return {
			title: `${error.status} ${error.statusText || "Route Error"}`.trim(),
			detail:
				typeof error.data === "string"
					? error.data
					: "The requested route failed to load.",
		};
	}

	if (error instanceof Error) {
		return {
			title: "Page crashed",
			detail: error.message || "Unexpected page error.",
		};
	}

	return {
		title: "Page crashed",
		detail: "Unexpected page error.",
	};
}

function RouteErrorBoundary(): React.JSX.Element {
	const error = useRouteError();
	const { title, detail } = formatRouteError(error);

	return (
		<div className="flex h-full min-h-[16rem] items-center justify-center p-6">
			<div className="w-full max-w-2xl rounded-2xl border border-error/30 bg-base-100 p-6 shadow-lg">
				<h2 className="font-semibold text-lg">{title}</h2>
				<p className="mt-2 text-base-content/70 text-sm">{detail}</p>
				<div className="mt-4">
					<button
						className="btn btn-error btn-sm"
						onClick={() => globalThis.location.reload()}
						type="button"
					>
						Reload page
					</button>
				</div>
			</div>
		</div>
	);
}

export { RoutePending, RouteErrorBoundary };
