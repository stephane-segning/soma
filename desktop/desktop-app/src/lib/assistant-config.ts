/**
 * Pure domain logic for the Assistant provider-config forms — the space
 * scope (`spaces/:spaceId/settings` Assistant tab) and the default scope
 * (`/settings` Assistant section) share this module since both forms are
 * the same field set (space just omits `pollIntervalMs`) with the same
 * auto-save-on-blur, inherit-vs-override, write-only-key semantics.
 *
 * Kept side-effect-free and framework-free — see `space-settings.ts`'s
 * file header for why (plain `vitest`, `environment: "node"`, no DOM).
 *
 * `backend.agent.config.*`'s own doc comment (`desktop-sdk/src/api/agent.ts`)
 * is the authoritative contract this mirrors: "Resolution order for actual
 * chat/embed calls is space -> default -> compiled-in constants; these
 * methods operate on the raw override row for one scope at a time
 * (get/set/clear), not the resolved/effective value... `set*` is a
 * whole-state overwrite... The API key is write-only."
 */
import type {
	AgentProvider,
	AgentProviderConfigView,
	ApiKeyInput,
	SetDefaultAgentProviderConfigArgs,
	SetSpaceAgentProviderConfigArgs,
} from "@soma/sdk";

// ---------------------------------------------------------------------------
// API key draft — the highest-risk mapping in this module. `get*` never
// returns the key value (only `hasApiKey`), so the form tracks a small
// local draft distinct from "what's saved": typing arms `set`, clicking
// the dedicated "Clear stored key" control arms `clear`, and anything
// else stays `unchanged`. Ending up with `clear` and `unchanged` swapped
// would either silently wipe a working key or silently fail to remove
// one the user explicitly asked to remove — get this exactly right.
// ---------------------------------------------------------------------------

export type ApiKeyDraft = { mode: "unchanged" } | { mode: "clear" } | { mode: "set"; value: string };

export const UNCHANGED_API_KEY_DRAFT: ApiKeyDraft = { mode: "unchanged" };

/**
 * Called from the key field's `onChange`. Typing anything becomes a
 * `set` draft; erasing the field back to empty reverts to `unchanged`
 * — NOT `clear`. Clearing the *text field* while typing is not the same
 * deliberate act as pressing the dedicated "Clear stored key" control
 * (`clearedApiKeyDraft`) — conflating the two would make it too easy to
 * wipe a working key by accident (e.g. select-all + backspace while
 * meaning to edit, then blur before retyping).
 */
export function apiKeyDraftFromTyped(value: string): ApiKeyDraft {
	return value.length === 0 ? UNCHANGED_API_KEY_DRAFT : { mode: "set", value };
}

/** The deliberate, explicit "remove the stored key" action. */
export function clearedApiKeyDraft(): ApiKeyDraft {
	return { mode: "clear" };
}

/** What the (controlled) `SecretInput` should display for a given draft — both `unchanged` and `clear` show a blank field; only `set` echoes typed text. */
export function apiKeyDraftDisplayValue(draft: ApiKeyDraft): string {
	return draft.mode === "set" ? draft.value : "";
}

/** The exact wire payload for `set*()`'s `apiKey` field. */
export function apiKeyDraftToInput(draft: ApiKeyDraft): ApiKeyInput {
	if (draft.mode === "clear") return { kind: "clear" };
	if (draft.mode === "set") return { kind: "set", value: draft.value };
	return { kind: "unchanged" };
}

// ---------------------------------------------------------------------------
// Inherit vs. override display. `current`/`inherited` are both raw
// override values (never resolved) — for the space scope, `inherited`
// is the default scope's own field; for the default scope, `inherited`
// is always `null` (there is no SDK-visible scope above it, only the
// compiled-in constants, which the client can't read literally).
// ---------------------------------------------------------------------------

export type FieldHint = { kind: "override" } | { kind: "inherited"; display: string } | { kind: "builtin" };

export function describeFieldInheritance<T extends string | number>(current: T | null, inherited: T | null): FieldHint {
	if (current !== null) return { kind: "override" };
	if (inherited !== null) return { kind: "inherited", display: String(inherited) };
	return { kind: "builtin" };
}

export type ApiKeyHint = { kind: "own" } | { kind: "inherited" } | { kind: "none" };

/** Same idea as `describeFieldInheritance`, specialized for the boolean-only `hasApiKey` (the actual value never reaches the client). Pass `inheritedHasKey: false` for the default scope (nothing above it to inherit from). */
export function describeApiKeyInheritance(hasOwnKey: boolean, inheritedHasKey: boolean): ApiKeyHint {
	if (hasOwnKey) return { kind: "own" };
	if (inheritedHasKey) return { kind: "inherited" };
	return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Form-field <-> override-value conversion. Every field uses the same
// "blank means inherit" rule: an empty input clears that column's
// override (`null`); a non-empty one sets it.
// ---------------------------------------------------------------------------

export function textFieldToOverride(raw: string): string | null {
	const trimmed = raw.trim();
	return trimmed.length === 0 ? null : trimmed;
}

/**
 * Rounds to the nearest integer, not just "parses a finite number" —
 * `requestTimeoutMs`/`pollIntervalMs` are wire-typed as `i32` on the
 * Rust side (`#[specta(type = Option<i32>)]` over a `u64`), so a literal
 * float (e.g. a pasted "1500.5") would fail deserialization server-side
 * instead of failing closed client-side. Non-finite input (empty,
 * garbage) degrades to `null` (inherit) rather than `NaN`/`0`.
 */
export function numberFieldToOverride(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function overrideToFieldText(value: string | number | null): string {
	return value === null ? "" : String(value);
}

// ---------------------------------------------------------------------------
// Provider derivation. Exactly one `AgentProvider` value exists today
// (`"open-ai-compatible"`) and the UI exposes no picker for it (nothing
// to pick) — `provider` is derived from whether any other field is
// overridden, not chosen directly by the user.
// ---------------------------------------------------------------------------

const ONLY_PROVIDER: AgentProvider = "open-ai-compatible";

export function deriveProviderOverride(hasAnyFieldOverride: boolean): AgentProvider | null {
	return hasAnyFieldOverride ? ONLY_PROVIDER : null;
}

// ---------------------------------------------------------------------------
// Form state <-> SDK view/args.
// ---------------------------------------------------------------------------

export type AssistantFormState = {
	baseUrl: string;
	chatModel: string;
	embedModel: string;
	requestTimeoutMs: string;
	apiKey: ApiKeyDraft;
};

export type DefaultAssistantFormState = AssistantFormState & { pollIntervalMs: string };

export function formStateFromView(view: AgentProviderConfigView): AssistantFormState {
	return {
		baseUrl: overrideToFieldText(view.baseUrl),
		chatModel: overrideToFieldText(view.chatModel),
		embedModel: overrideToFieldText(view.embedModel),
		requestTimeoutMs: overrideToFieldText(view.requestTimeoutMs),
		apiKey: UNCHANGED_API_KEY_DRAFT,
	};
}

export function defaultFormStateFromView(view: AgentProviderConfigView): DefaultAssistantFormState {
	return { ...formStateFromView(view), pollIntervalMs: overrideToFieldText(view.pollIntervalMs) };
}

function sharedOverrides(form: AssistantFormState) {
	return {
		baseUrl: textFieldToOverride(form.baseUrl),
		chatModel: textFieldToOverride(form.chatModel),
		embedModel: textFieldToOverride(form.embedModel),
		requestTimeoutMs: numberFieldToOverride(form.requestTimeoutMs),
	};
}

export function buildSpaceSaveArgs(spaceId: string, form: AssistantFormState): SetSpaceAgentProviderConfigArgs {
	const overrides = sharedOverrides(form);
	const hasAnyOverride =
		overrides.baseUrl !== null ||
		overrides.chatModel !== null ||
		overrides.embedModel !== null ||
		overrides.requestTimeoutMs !== null;
	return {
		spaceId,
		provider: deriveProviderOverride(hasAnyOverride),
		...overrides,
		apiKey: apiKeyDraftToInput(form.apiKey),
	};
}

export function buildDefaultSaveArgs(form: DefaultAssistantFormState): SetDefaultAgentProviderConfigArgs {
	const overrides = sharedOverrides(form);
	const pollIntervalMs = numberFieldToOverride(form.pollIntervalMs);
	const hasAnyOverride =
		overrides.baseUrl !== null ||
		overrides.chatModel !== null ||
		overrides.embedModel !== null ||
		overrides.requestTimeoutMs !== null ||
		pollIntervalMs !== null;
	return {
		provider: deriveProviderOverride(hasAnyOverride),
		...overrides,
		pollIntervalMs,
		apiKey: apiKeyDraftToInput(form.apiKey),
	};
}

// ---------------------------------------------------------------------------
// Space-scope write authorization. Mirrors
// `backend/crates/daemon/src/handle/agent_config.rs::caller_is_space_owner`
// exactly (including "fail closed when the owner is unprovable") so the
// UI can gate the form before the user fills it out, rather than only
// after a save rejects with "not authorized... caller is not the space
// owner". The backend remains the real enforcement boundary regardless.
// ---------------------------------------------------------------------------

export function isSpaceOwner(ownerPeerId: string | null | undefined, myPeerId: string | null): boolean {
	return myPeerId !== null && ownerPeerId != null && ownerPeerId === myPeerId;
}
