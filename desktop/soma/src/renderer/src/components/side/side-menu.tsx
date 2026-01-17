import { AsideNavigation } from "@soma/components/side/aside-navigation.tsx";
import { SpacesRail } from "@soma/components/spaces-rail.tsx";

function SideMenu() {
	return (
		<div className="flex h-full">
			<div className="border-base-300 border-r bg-base-200/70">
				<SpacesRail />
			</div>
			<div className="grow">
				<AsideNavigation />
			</div>
		</div>
	);
}

export { SideMenu };
