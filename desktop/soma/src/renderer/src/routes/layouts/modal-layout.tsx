import { Outlet } from "react-router";

function Component(): React.JSX.Element {
	return (
		<div
			className="flex h-content min-h-full w-full items-start justify-center overflow-auto px-4 py-6 md:px-6"
			data-no-drag
		>
			<div className="w-full max-w-5xl">
				<div className="rounded-2xl border border-base-300 bg-base-100 shadow-lg">
					<div className="p-6 md:p-8">
						<Outlet />
					</div>
				</div>
			</div>
		</div>
	);
}

export { Component };
