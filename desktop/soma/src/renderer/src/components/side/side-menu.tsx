import { AsideNavigation } from "@app/components/side/aside-navigation.tsx";
import { SpacesRail } from "@app/components/spaces-rail.tsx";

function SideMenu() {
	return (
		<div className="flex h-full">
			<SpacesRail />
			<div className="grow">
				<AsideNavigation />
			</div>
		</div>
	);
}

export { SideMenu };
