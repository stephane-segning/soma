import { AsideNavigation } from "@soma/components/side/aside-navigation.tsx";
import { SpacesRail } from "@soma/components/spaces-rail.tsx";

function SideMenu() {
	return (
		<div className="flex">
			<div>
				<SpacesRail />
			</div>
			<div className="grow">
				<AsideNavigation />
			</div>
		</div>
	);
}

export { SideMenu };
