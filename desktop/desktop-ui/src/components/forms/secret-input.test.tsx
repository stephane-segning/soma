/**
 * Regression test — SecretInput must default to masked (`type="password"`)
 * and only reveal plaintext on an explicit click of its own toggle, never
 * on mount or as a side effect of typing. That's the entire reason this
 * primitive exists over a plain `<input>` (see the file's doc comment).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { SomaIntlProvider } from "../../i18n/intl-provider";
import { SecretInput } from "./secret-input";

function renderWithIntl(ui: ReactElement) {
	return render(<SomaIntlProvider>{ui}</SomaIntlProvider>);
}

describe("SecretInput", () => {
	it("renders masked (type=password) by default", () => {
		renderWithIntl(<SecretInput onChange={() => undefined} value="sk-live-secret" />);
		const input = screen.getByDisplayValue("sk-live-secret") as HTMLInputElement;
		expect(input.type).toBe("password");
	});

	it("reveals plaintext on toggle click, and re-masks on a second click", () => {
		renderWithIntl(<SecretInput onChange={() => undefined} value="sk-live-secret" />);
		const input = screen.getByDisplayValue("sk-live-secret") as HTMLInputElement;
		const toggle = screen.getByRole("button");

		fireEvent.click(toggle);
		expect(input.type).toBe("text");

		fireEvent.click(toggle);
		expect(input.type).toBe("password");
	});

	it("calls onChange with the typed value, not a masked placeholder", () => {
		const onChange = vi.fn();
		const { container } = renderWithIntl(<SecretInput onChange={onChange} value="" />);
		const input = container.querySelector("input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "new-key" } });
		expect(onChange).toHaveBeenCalledWith("new-key");
	});

	it("calls onBlur when the field loses focus", () => {
		const onBlur = vi.fn();
		const { container } = renderWithIntl(<SecretInput onBlur={onBlur} onChange={() => undefined} value="" />);
		const input = container.querySelector("input") as HTMLInputElement;
		fireEvent.blur(input);
		expect(onBlur).toHaveBeenCalledOnce();
	});

	it("renders the caller-supplied placeholder (used to signal a stored-but-unshown value)", () => {
		renderWithIntl(
			<SecretInput onChange={() => undefined} placeholder="Unchanged — leave blank to keep the current key" value="" />,
		);
		// `getByPlaceholderText` throws if no match is found, so a
		// non-null return is itself the assertion that it rendered.
		expect(screen.getByPlaceholderText("Unchanged — leave blank to keep the current key")).not.toBeNull();
	});

	it("disables both the input and the reveal toggle when disabled", () => {
		renderWithIntl(<SecretInput disabled onChange={() => undefined} value="sk-live-secret" />);
		const input = screen.getByDisplayValue("sk-live-secret") as HTMLInputElement;
		const toggle = screen.getByRole("button") as HTMLButtonElement;
		expect(input.disabled).toBe(true);
		expect(toggle.disabled).toBe(true);
	});

	it("renders the label when provided and associates it with the input", () => {
		renderWithIntl(<SecretInput label="API key" onChange={() => undefined} value="" />);
		// `getByLabelText` throws unless it finds exactly one match, which
		// also confirms the <label> is correctly associated via htmlFor/id.
		expect(screen.getByLabelText("API key")).not.toBeNull();
	});
});
