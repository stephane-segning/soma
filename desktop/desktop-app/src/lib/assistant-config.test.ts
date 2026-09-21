import type { AgentProviderConfigView } from "@soma/sdk";
import { describe, expect, it } from "vitest";
import {
	apiKeyDraftDisplayValue,
	apiKeyDraftFromTyped,
	apiKeyDraftToInput,
	buildDefaultSaveArgs,
	buildSpaceSaveArgs,
	clearedApiKeyDraft,
	defaultFormStateFromView,
	deriveProviderOverride,
	describeApiKeyInheritance,
	describeFieldInheritance,
	formStateFromView,
	isSpaceOwner,
	numberFieldToOverride,
	overrideToFieldText,
	textFieldToOverride,
	UNCHANGED_API_KEY_DRAFT,
} from "./assistant-config";

// ---------------------------------------------------------------------------
// apiKey draft <-> ApiKeyInput. Flagged as the highest-risk mapping in the
// module: unchanged/clear/set must never be conflated, in either direction.
// ---------------------------------------------------------------------------

describe("apiKeyDraftFromTyped", () => {
	it("typing a non-empty value arms a 'set' draft with that exact value", () => {
		expect(apiKeyDraftFromTyped("sk-live-123")).toEqual({ mode: "set", value: "sk-live-123" });
	});

	it("erasing the field back to empty reverts to 'unchanged', NOT 'clear'", () => {
		expect(apiKeyDraftFromTyped("")).toEqual(UNCHANGED_API_KEY_DRAFT);
		expect(apiKeyDraftFromTyped("")).toEqual({ mode: "unchanged" });
	});
});

describe("clearedApiKeyDraft", () => {
	it("produces a distinct 'clear' draft, never conflated with 'unchanged'", () => {
		const cleared = clearedApiKeyDraft();
		expect(cleared).toEqual({ mode: "clear" });
		expect(cleared).not.toEqual(UNCHANGED_API_KEY_DRAFT);
	});
});

describe("apiKeyDraftDisplayValue", () => {
	it("shows the typed value only for a 'set' draft", () => {
		expect(apiKeyDraftDisplayValue({ mode: "set", value: "sk-live-123" })).toBe("sk-live-123");
	});

	it("shows blank for 'unchanged' (nothing was typed)", () => {
		expect(apiKeyDraftDisplayValue({ mode: "unchanged" })).toBe("");
	});

	it("shows blank for 'clear' (the field itself has nothing to show)", () => {
		expect(apiKeyDraftDisplayValue({ mode: "clear" })).toBe("");
	});
});

describe("apiKeyDraftToInput — the exact save-payload mapping", () => {
	it("maps 'unchanged' to { kind: 'unchanged' }", () => {
		expect(apiKeyDraftToInput({ mode: "unchanged" })).toEqual({ kind: "unchanged" });
	});

	it("maps 'clear' to { kind: 'clear' } — never silently 'unchanged'", () => {
		expect(apiKeyDraftToInput({ mode: "clear" })).toEqual({ kind: "clear" });
	});

	it("maps 'set' to { kind: 'set', value } with the exact typed value, never truncated or re-cased", () => {
		expect(apiKeyDraftToInput({ mode: "set", value: "sk-Live-MixedCase-123" })).toEqual({
			kind: "set",
			value: "sk-Live-MixedCase-123",
		});
	});

	it("round-trips every draft mode without cross-contamination", () => {
		const cases: Array<[ReturnType<typeof apiKeyDraftFromTyped> | ReturnType<typeof clearedApiKeyDraft>, string]> = [
			[UNCHANGED_API_KEY_DRAFT, "unchanged"],
			[clearedApiKeyDraft(), "clear"],
			[apiKeyDraftFromTyped("x"), "set"],
		];
		for (const [draft, expectedKind] of cases) {
			expect(apiKeyDraftToInput(draft).kind).toBe(expectedKind);
		}
	});
});

// ---------------------------------------------------------------------------
// Inherit / override merge display.
// ---------------------------------------------------------------------------

describe("describeFieldInheritance", () => {
	it("reports 'override' whenever the current scope has its own value, regardless of what's inherited", () => {
		expect(describeFieldInheritance("https://my-endpoint", "https://default-endpoint")).toEqual({
			kind: "override",
		});
		expect(describeFieldInheritance("https://my-endpoint", null)).toEqual({ kind: "override" });
	});

	it("reports 'inherited' with the display value when current is null but a higher scope has one", () => {
		expect(describeFieldInheritance(null, "https://default-endpoint")).toEqual({
			kind: "inherited",
			display: "https://default-endpoint",
		});
	});

	it("reports 'builtin' when both the current and inherited scopes are null (falls to the compiled-in default)", () => {
		expect(describeFieldInheritance(null, null)).toEqual({ kind: "builtin" });
	});

	it("stringifies a numeric inherited value for display", () => {
		expect(describeFieldInheritance<number>(null, 30000)).toEqual({ kind: "inherited", display: "30000" });
	});
});

describe("describeApiKeyInheritance", () => {
	it("reports 'own' when this scope has its own key, regardless of what's inherited", () => {
		expect(describeApiKeyInheritance(true, true)).toEqual({ kind: "own" });
		expect(describeApiKeyInheritance(true, false)).toEqual({ kind: "own" });
	});

	it("reports 'inherited' when this scope has none but a higher scope does", () => {
		expect(describeApiKeyInheritance(false, true)).toEqual({ kind: "inherited" });
	});

	it("reports 'none' when neither this scope nor the inherited one has a key", () => {
		expect(describeApiKeyInheritance(false, false)).toEqual({ kind: "none" });
	});
});

// ---------------------------------------------------------------------------
// Field <-> override-value conversion.
// ---------------------------------------------------------------------------

describe("textFieldToOverride", () => {
	it("blank (or whitespace-only) input becomes null (inherit)", () => {
		expect(textFieldToOverride("")).toBeNull();
		expect(textFieldToOverride("   ")).toBeNull();
	});

	it("non-blank input becomes the trimmed override value", () => {
		expect(textFieldToOverride("  https://example.com  ")).toBe("https://example.com");
	});
});

describe("numberFieldToOverride", () => {
	it("blank input becomes null (inherit)", () => {
		expect(numberFieldToOverride("")).toBeNull();
		expect(numberFieldToOverride("   ")).toBeNull();
	});

	it("a whole number becomes that override value", () => {
		expect(numberFieldToOverride("30000")).toBe(30000);
	});

	it("rounds a float instead of forwarding it — the wire type is a 32-bit int, not a float", () => {
		expect(numberFieldToOverride("1500.5")).toBe(1501);
		expect(numberFieldToOverride("1500.4")).toBe(1500);
	});

	it("garbage input degrades to null rather than NaN", () => {
		expect(numberFieldToOverride("not-a-number")).toBeNull();
	});
});

describe("overrideToFieldText", () => {
	it("null becomes an empty string", () => {
		expect(overrideToFieldText(null)).toBe("");
	});

	it("a string value passes through unchanged", () => {
		expect(overrideToFieldText("https://example.com")).toBe("https://example.com");
	});

	it("a number value stringifies", () => {
		expect(overrideToFieldText(30000)).toBe("30000");
	});
});

// ---------------------------------------------------------------------------
// Provider derivation.
// ---------------------------------------------------------------------------

describe("deriveProviderOverride", () => {
	it("derives the only real provider value when any field is overridden", () => {
		expect(deriveProviderOverride(true)).toBe("open-ai-compatible");
	});

	it("derives null (fully inheriting) when nothing is overridden", () => {
		expect(deriveProviderOverride(false)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Save-args builders — the whole-state-overwrite payloads.
// ---------------------------------------------------------------------------

const BLANK_FORM = {
	baseUrl: "",
	chatModel: "",
	embedModel: "",
	requestTimeoutMs: "",
	apiKey: UNCHANGED_API_KEY_DRAFT,
};

describe("buildSpaceSaveArgs", () => {
	it("an all-blank form saves a fully-inheriting row: every field null, provider null", () => {
		expect(buildSpaceSaveArgs("space-1", BLANK_FORM)).toEqual({
			spaceId: "space-1",
			provider: null,
			baseUrl: null,
			chatModel: null,
			embedModel: null,
			requestTimeoutMs: null,
			apiKey: { kind: "unchanged" },
		});
	});

	it("setting one field derives provider and includes it alongside nulls for the rest", () => {
		const args = buildSpaceSaveArgs("space-1", { ...BLANK_FORM, baseUrl: "https://my-llm.example" });
		expect(args.provider).toBe("open-ai-compatible");
		expect(args.baseUrl).toBe("https://my-llm.example");
		expect(args.chatModel).toBeNull();
		expect(args.embedModel).toBeNull();
		expect(args.requestTimeoutMs).toBeNull();
	});

	it("carries the api key draft through to the exact ApiKeyInput payload", () => {
		const setArgs = buildSpaceSaveArgs("space-1", { ...BLANK_FORM, apiKey: { mode: "set", value: "sk-123" } });
		expect(setArgs.apiKey).toEqual({ kind: "set", value: "sk-123" });

		const clearArgs = buildSpaceSaveArgs("space-1", { ...BLANK_FORM, apiKey: clearedApiKeyDraft() });
		expect(clearArgs.apiKey).toEqual({ kind: "clear" });
	});

	it("has no pollIntervalMs key at all — the space scope's writable surface excludes it", () => {
		const args = buildSpaceSaveArgs("space-1", BLANK_FORM);
		expect("pollIntervalMs" in args).toBe(false);
	});

	it("populates every non-blank field together in one whole-state payload", () => {
		const args = buildSpaceSaveArgs("space-1", {
			baseUrl: "https://my-llm.example",
			chatModel: "gpt-x",
			embedModel: "embed-y",
			requestTimeoutMs: "45000",
			apiKey: UNCHANGED_API_KEY_DRAFT,
		});
		expect(args).toEqual({
			spaceId: "space-1",
			provider: "open-ai-compatible",
			baseUrl: "https://my-llm.example",
			chatModel: "gpt-x",
			embedModel: "embed-y",
			requestTimeoutMs: 45000,
			apiKey: { kind: "unchanged" },
		});
	});
});

describe("buildDefaultSaveArgs", () => {
	const blankDefault = { ...BLANK_FORM, pollIntervalMs: "" };

	it("an all-blank form saves a fully-inheriting row including pollIntervalMs", () => {
		expect(buildDefaultSaveArgs(blankDefault)).toEqual({
			provider: null,
			baseUrl: null,
			chatModel: null,
			embedModel: null,
			requestTimeoutMs: null,
			pollIntervalMs: null,
			apiKey: { kind: "unchanged" },
		});
	});

	it("setting only pollIntervalMs still derives a non-null provider", () => {
		const args = buildDefaultSaveArgs({ ...blankDefault, pollIntervalMs: "60000" });
		expect(args.provider).toBe("open-ai-compatible");
		expect(args.pollIntervalMs).toBe(60000);
		expect(args.baseUrl).toBeNull();
	});

	it("has no spaceId key — the default scope isn't keyed to a space", () => {
		const args = buildDefaultSaveArgs(blankDefault);
		expect("spaceId" in args).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// View -> form-state hydration.
// ---------------------------------------------------------------------------

function view(overrides: Partial<AgentProviderConfigView> = {}): AgentProviderConfigView {
	return {
		provider: null,
		baseUrl: null,
		hasApiKey: false,
		chatModel: null,
		embedModel: null,
		requestTimeoutMs: null,
		pollIntervalMs: null,
		updatedAtMs: null,
		...overrides,
	};
}

describe("formStateFromView", () => {
	it("hydrates blank text fields from an all-null view, and always starts with an 'unchanged' key draft", () => {
		expect(formStateFromView(view())).toEqual({
			baseUrl: "",
			chatModel: "",
			embedModel: "",
			requestTimeoutMs: "",
			apiKey: UNCHANGED_API_KEY_DRAFT,
		});
	});

	it("hydrates fields with their saved override values, never the api key value (there isn't one to hydrate)", () => {
		const state = formStateFromView(
			view({ baseUrl: "https://my-llm.example", chatModel: "gpt-x", requestTimeoutMs: 45000, hasApiKey: true }),
		);
		expect(state.baseUrl).toBe("https://my-llm.example");
		expect(state.chatModel).toBe("gpt-x");
		expect(state.requestTimeoutMs).toBe("45000");
		expect(state.apiKey).toEqual(UNCHANGED_API_KEY_DRAFT);
	});
});

describe("defaultFormStateFromView", () => {
	it("additionally hydrates pollIntervalMs", () => {
		const state = defaultFormStateFromView(view({ pollIntervalMs: 60000 }));
		expect(state.pollIntervalMs).toBe("60000");
	});
});

// ---------------------------------------------------------------------------
// Space-scope write authorization (mirrors the Rust `caller_is_space_owner`).
// ---------------------------------------------------------------------------

describe("isSpaceOwner", () => {
	it("is true only when both ids are known and equal", () => {
		expect(isSpaceOwner("peer-a", "peer-a")).toBe(true);
	});

	it("is false for a different peer", () => {
		expect(isSpaceOwner("peer-a", "peer-b")).toBe(false);
	});

	it("fails closed when the owner is unprovable (null/undefined), even for a plausible caller id", () => {
		expect(isSpaceOwner(null, "peer-a")).toBe(false);
		expect(isSpaceOwner(undefined, "peer-a")).toBe(false);
	});

	it("fails closed when the caller's own identity is unknown", () => {
		expect(isSpaceOwner("peer-a", null)).toBe(false);
	});
});
