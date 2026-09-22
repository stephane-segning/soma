/**
 * useCreateSpace — `backend.spaces.create` + navigate-to-the-new-space,
 * shared by every "create a space" affordance that isn't the command
 * palette's own copy of this flow (`SpacesRailContainer`'s trailing
 * `+` button, `SpaceSwitcherContainer`'s "Create space" sheet row).
 *
 * On failure, navigates to `/spaces` with an inline notice (ADR-0005
 * §6 — no toast-only feedback for primary actions) instead of
 * swallowing the error, same as the global "New Space" command
 * (`command-palette-root.tsx`, which has its own equivalent inline
 * because it dispatches from outside the router tree these hooks run
 * in).
 */
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { backend } from "./backend";

export function useCreateSpace(): { create: () => void; creating: boolean } {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const [creating, setCreating] = useState(false);
	// Guards against a double-click firing two concurrent creates —
	// mirrors the ref-based guard the pre-extraction `SpacesRailContainer`
	// used, which has no busy visual of its own; `creating` (state, not
	// just a ref) exists for callers like the switcher sheet that do
	// want to reflect a busy state.
	const creatingRef = useRef(false);

	const create = useCallback(() => {
		if (creatingRef.current) return;
		creatingRef.current = true;
		setCreating(true);
		void (async () => {
			try {
				const space = await backend.spaces.create(null);
				navigate(`/spaces/${space.spaceId}`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				navigate("/spaces", {
					state: {
						notice: t("pages.spaces_index.create_error", "Couldn't create a space: {{message}}", { message }),
					},
				});
			} finally {
				creatingRef.current = false;
				setCreating(false);
			}
		})();
	}, [navigate, t]);

	return { create, creating };
}
