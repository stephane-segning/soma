/**
 * Locks the interaction between the palette's built-in client-side
 * filter and externally-supplied (`onQueryChange` -> server) results.
 *
 * Found by running it, not by reading it: the daemon's search matches
 * document *body* text, so a real hit routinely has a title that does
 * not contain the query at all ("checksum" matching a page titled
 * "Quarterly rollout plan"). The request fired, 200'd, and the hit was
 * then dropped by the local title/subtitle filter — the palette showed
 * "No matches" over a non-empty result set. `prematched` is the opt-out
 * that keeps those hits visible while locally-known items (commands)
 * keep filtering as you type.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SomaIntlProvider } from "../../i18n/intl-provider";
import { CommandPalette, type CommandPaletteItem } from "./command-palette";

const serverHit: CommandPaletteItem = {
	id: "hit",
	title: "Quarterly rollout plan",
	subtitle: "…the migration checksum lesson…",
	section: "documents",
	prematched: true,
	onSelect: () => {},
};

const localCommand: CommandPaletteItem = {
	id: "cmd-new-page",
	title: "New page",
	section: "commands",
	onSelect: () => {},
};

function setup(items: CommandPaletteItem[], onQueryChange?: (q: string) => void) {
	return render(
		<SomaIntlProvider>
			<CommandPalette items={items} onClose={() => {}} onQueryChange={onQueryChange} open />
		</SomaIntlProvider>,
	);
}

describe("CommandPalette external results", () => {
	it("keeps a prematched hit whose title does not contain the query", async () => {
		const user = userEvent.setup();
		setup([serverHit, localCommand]);

		// Deliberately a term that appears in neither title nor section
		// label — only in the body text the server matched on.
		await user.type(screen.getByRole("textbox"), "zzz-body-only");

		expect(screen.getByText("Quarterly rollout plan")).toBeTruthy();
		expect(screen.queryByText("No matches")).toBeNull();
		// The local command is still filtered out — prematched is
		// per-item, not a global filter kill-switch.
		expect(screen.queryByText("New page")).toBeNull();
	});

	it("still filters items that are not prematched", async () => {
		const user = userEvent.setup();
		setup([localCommand]);

		await user.type(screen.getByRole("textbox"), "zzz-body-only");

		expect(screen.queryByText("New page")).toBeNull();
		expect(screen.getByText("No matches")).toBeTruthy();
	});

	it("reports every keystroke so the caller can drive a server query", async () => {
		const user = userEvent.setup();
		const onQueryChange = vi.fn();
		setup([localCommand], onQueryChange);

		await user.type(screen.getByRole("textbox"), "abc");

		// The leading "" is the open-time reset, and it is load-bearing:
		// it tells the caller to drop results from the previous open
		// before any new keystroke arrives.
		expect(onQueryChange.mock.calls.map(([q]) => q)).toEqual(["", "a", "ab", "abc"]);
	});
});
