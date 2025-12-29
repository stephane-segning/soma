import { Outlet } from "react-router";
import { AuroraWallpaper } from "soma-ui/components/layout/wallpaper";

function ShellLayout() {
	return (
		<div className="relative min-h-screen bg-base-200 text-base-content">
			<AuroraWallpaper />
			<div className="relative z-10 h-full w-full">
				<Outlet />
			</div>
		</div>
	);
}

export { ShellLayout };
