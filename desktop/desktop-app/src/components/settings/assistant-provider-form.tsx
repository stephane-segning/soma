/**
 * AssistantProviderForm — the AI-provider config form shared by the
 * default scope (`/settings` Assistant section) and the space scope
 * (`spaces/:spaceId/settings` Assistant tab). One field set, one
 * auto-save-on-blur contract (ADR-0005 §3), used from both places with
 * a couple of scope-specific props (`showPollInterval`, `readOnly`).
 *
 * PRD refs assistant-bots §1 locks: single-column form, no wizard, no
 * modal; the API key is always `type=password` + reveal toggle
 * (`SecretInput`, never a plain text input); validated on blur, not a
 * "Test connection" button, with the result rendered inline under the
 * field (no toast, no modal).
 *
 * *** Deliberate deviation from the PRD's literal shape, per product
 * direction ***: the PRD describes a *list* of ACP backends per space
 * with `Manage ⌄` rows and a `Default` pill — that IA assumes ACP and
 * multiple pluggable backends. Neither exists: there's exactly one
 * `AgentProvider` value (`"open-ai-compatible"`) and exactly one config
 * row per scope. This form has no list, no `Manage ⌄`, no default pill —
 * just the field-level patterns (single column, password+reveal,
 * on-blur inline validation) applied directly to the one config that
 * can exist. `provider` itself isn't a user-facing field for the same
 * reason: there's nothing to pick, so it's derived (see
 * `deriveProviderOverride` in `lib/assistant-config.ts`) from whether
 * any other field is overridden, rather than shown as a one-option
 * dropdown.
 *
 * Inherit vs. override, per field (not per form): every field is blank
 * = inherit (send `null`), non-blank = override. When inheriting, the
 * field's placeholder *is* the inherited value (or a "built-in default"
 * hint when nothing anywhere overrides it) — see
 * `describeFieldInheritance` — so clearing a field is exactly how a user
 * reverts to inheriting, and the blank field still shows what it's
 * about to inherit.
 */
import type {
	AgentProviderConfigView,
	ValidateAgentProviderConfigArgs,
	ValidateAgentProviderConfigResult,
} from "@soma/sdk";
import { SecretInput } from "@soma/ui/components/forms/secret-input";
import { Pill } from "@soma/ui/components/primitives/pill";
import { type ReactNode, useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type ApiKeyHint,
	apiKeyDraftDisplayValue,
	apiKeyDraftFromTyped,
	clearedApiKeyDraft,
	type DefaultAssistantFormState,
	defaultFormStateFromView,
	describeApiKeyInheritance,
	describeFieldInheritance,
	type FieldHint,
	numberFieldToOverride,
} from "../../lib/assistant-config";

export type AssistantProviderFormProps = {
	/** This scope's raw override row (`getDefault()`/`getSpace()`). */
	view: AgentProviderConfigView;
	/**
	 * The scope above this one, for inherit-hint display — the default
	 * scope's view for a space-scope form, or `null` for the default
	 * scope itself (nothing above it is SDK-visible; see the module's
	 * doc comment on `describeFieldInheritance`).
	 */
	inherited: AgentProviderConfigView | null;
	/** Only the default scope's poll interval is configurable (`SetSpaceAgentProviderConfigArgs` has no such field at all). */
	showPollInterval: boolean;
	readOnly?: boolean;
	readOnlyMessage?: ReactNode;
	/** Persists the complete current form state (whole-state overwrite) and returns the fresh view. Scope-specific (`setDefault` vs `setSpace`) — owned by the caller. */
	onSave: (form: DefaultAssistantFormState) => Promise<AgentProviderConfigView>;
	/** `backend.agent.config.validate` — identical for both scopes, so the caller just forwards it. */
	onValidate: (args: ValidateAgentProviderConfigArgs) => Promise<ValidateAgentProviderConfigResult>;
};

function FieldHintLine({ hint }: { hint: FieldHint }) {
	const { t } = useTranslation();
	if (hint.kind === "override") return null;
	if (hint.kind === "inherited") {
		return (
			<span className="text-base-content/50 text-xs">
				{t("assistant.fields.inheritedHint", { value: hint.display })}
			</span>
		);
	}
	return <span className="text-base-content/50 text-xs">{t("assistant.fields.builtinHint")}</span>;
}

function ApiKeyHintLine({ hint }: { hint: ApiKeyHint }) {
	const { t } = useTranslation();
	if (hint.kind === "own") return null;
	if (hint.kind === "inherited") {
		return <span className="text-base-content/50 text-xs">{t("assistant.fields.apiKey.inheritedHint")}</span>;
	}
	return <span className="text-base-content/50 text-xs">{t("assistant.fields.apiKey.noneHint")}</span>;
}

function FormCard({ title, children }: { title: ReactNode; children: ReactNode }) {
	return (
		<section className="surface-card flex flex-col gap-3 p-3">
			<h3 className="font-medium text-base-content/90 text-sm">{title}</h3>
			{children}
		</section>
	);
}

/**
 * `id` is required (not generated internally) — `children` is an
 * opaque, caller-constructed input element, so the caller must be the
 * one to put the same id on it; `Field` only owns the `<label>` side of
 * the `htmlFor`/`id` pair (a11y: a label with no associated control is a
 * lint error, and `SecretInput`'s own internal label makes it the one
 * exception — see the apiKey field below, which skips `Field` entirely).
 */
function Field({ id, label, hint, children }: { id: string; label: ReactNode; hint?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-base-content/70 text-xs" htmlFor={id}>
				{label}
			</label>
			{children}
			{hint}
		</div>
	);
}

export function AssistantProviderForm({
	view,
	inherited,
	showPollInterval,
	readOnly,
	readOnlyMessage,
	onSave,
	onValidate,
}: AssistantProviderFormProps) {
	const { t } = useTranslation();
	// Lazy-initialized from `view` exactly once at mount. This component
	// owns its own state after that — it does NOT re-sync from a changed
	// `view` prop on every parent re-render (that would stomp in-progress
	// edits mid-type). When the underlying row's *identity* genuinely
	// changes (e.g. the space-settings route switches to a different
	// space), the caller remounts this component with a fresh `key`
	// (`AssistantTab` keys it on `spaceId`) rather than this component
	// trying to detect that from prop changes.
	const [form, setForm] = useState<DefaultAssistantFormState>(() => defaultFormStateFromView(view));
	const [hasOwnKey, setHasOwnKey] = useState(view.hasApiKey);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [validating, setValidating] = useState(false);
	const [validateResult, setValidateResult] = useState<ValidateAgentProviderConfigResult | null>(null);

	const baseUrlId = useId();
	const chatModelId = useId();
	const embedModelId = useId();
	const requestTimeoutId = useId();
	const pollIntervalId = useId();

	const save = useCallback(
		async (next: DefaultAssistantFormState) => {
			setSaveError(null);
			try {
				const fresh = await onSave(next);
				setHasOwnKey(fresh.hasApiKey);
				// The key field always collapses back to "unchanged" after a
				// successful save — whatever was typed (or the clear request)
				// is now reflected in `hasOwnKey`; nothing left to re-send.
				setForm({ ...next, apiKey: { mode: "unchanged" } });
			} catch (err) {
				setSaveError(err instanceof Error ? err.message : String(err));
			}
		},
		[onSave],
	);

	const validateConnection = useCallback(
		async (baseUrl: string, apiKey: string | undefined, requestTimeoutMs: number | null) => {
			if (!baseUrl) {
				setValidateResult(null);
				return;
			}
			setValidating(true);
			try {
				const result = await onValidate({ baseUrl, apiKey, requestTimeoutMs });
				setValidateResult(result);
			} catch (err) {
				setValidateResult({ ok: false, modelCount: null, error: err instanceof Error ? err.message : String(err) });
			} finally {
				setValidating(false);
			}
		},
		[onValidate],
	);

	// The base URL actually probed on blur: the user's own override if
	// they typed one, otherwise whatever this field would inherit —
	// validating "what the user is about to get" is more useful than
	// only ever validating an explicit override. Skipped entirely when
	// even that's unknown (the "builtin" case — nothing client-visible
	// to probe).
	const baseUrlHint = describeFieldInheritance(view.baseUrl, inherited?.baseUrl ?? null);
	const effectiveBaseUrlForValidation =
		form.baseUrl.trim() || (baseUrlHint.kind === "inherited" ? baseUrlHint.display : "");

	const handleBaseUrlBlur = useCallback(() => {
		void save(form);
		const typedKey = form.apiKey.mode === "set" ? form.apiKey.value : undefined;
		const timeout = numberFieldToOverride(form.requestTimeoutMs);
		if (effectiveBaseUrlForValidation) {
			void validateConnection(effectiveBaseUrlForValidation, typedKey, timeout);
		}
	}, [form, save, validateConnection, effectiveBaseUrlForValidation]);

	const handleApiKeyBlur = useCallback(() => {
		void save(form);
		if (form.apiKey.mode === "set" && effectiveBaseUrlForValidation) {
			const timeout = numberFieldToOverride(form.requestTimeoutMs);
			void validateConnection(effectiveBaseUrlForValidation, form.apiKey.value, timeout);
		}
	}, [form, save, validateConnection, effectiveBaseUrlForValidation]);

	const handlePlainBlur = useCallback(() => {
		void save(form);
	}, [form, save]);

	const chatModelHint = describeFieldInheritance(view.chatModel, inherited?.chatModel ?? null);
	const embedModelHint = describeFieldInheritance(view.embedModel, inherited?.embedModel ?? null);
	const requestTimeoutHint = describeFieldInheritance(view.requestTimeoutMs, inherited?.requestTimeoutMs ?? null);
	const pollIntervalHint = describeFieldInheritance(view.pollIntervalMs, null);
	const apiKeyHint = describeApiKeyInheritance(hasOwnKey, inherited?.hasApiKey ?? false);

	const apiKeyPlaceholder =
		apiKeyHint.kind === "own"
			? t("assistant.fields.apiKey.placeholderOwn")
			: apiKeyHint.kind === "inherited"
				? t("assistant.fields.apiKey.placeholderInherited")
				: t("assistant.fields.apiKey.placeholderNone");

	return (
		<div className="flex flex-col gap-4">
			{readOnly && readOnlyMessage ? (
				<div className="rounded-md border border-base-300 bg-base-200 px-3 py-2 text-base-content/70 text-sm">
					{readOnlyMessage}
				</div>
			) : null}

			{saveError ? (
				<div className="rounded-md border border-error/40 bg-error/5 px-3 py-2 text-error text-sm">{saveError}</div>
			) : null}

			<FormCard title={t("assistant.cards.connection")}>
				<Field hint={<FieldHintLine hint={baseUrlHint} />} id={baseUrlId} label={t("assistant.fields.baseUrl.label")}>
					<input
						className="w-full rounded-md border border-base-300 bg-base-100 px-2 py-1.5 font-mono text-sm outline-none focus-visible:border-primary"
						disabled={readOnly}
						id={baseUrlId}
						onBlur={handleBaseUrlBlur}
						onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
						placeholder={t("assistant.fields.baseUrl.placeholder")}
						spellCheck={false}
						type="text"
						value={form.baseUrl}
					/>
				</Field>
				{validating ? (
					<span className="text-base-content/60 text-xs">{t("assistant.fields.baseUrl.validating")}</span>
				) : validateResult ? (
					validateResult.ok ? (
						<Pill tone="success">
							{t("assistant.fields.baseUrl.validateOk", { count: validateResult.modelCount ?? 0 })}
						</Pill>
					) : (
						<Pill tone="error">{validateResult.error}</Pill>
					)
				) : null}

				{/* Not `Field` here — `SecretInput` renders its own internal,
				    properly-associated <label> from its `label` prop, so
				    wrapping it in a second outer label would either duplicate
				    the label or leave `Field`'s own label unassociated. */}
				<div className="flex flex-col gap-1">
					<SecretInput
						disabled={readOnly}
						label={t("assistant.fields.apiKey.label")}
						onBlur={handleApiKeyBlur}
						onChange={(next) => setForm((prev) => ({ ...prev, apiKey: apiKeyDraftFromTyped(next) }))}
						placeholder={apiKeyPlaceholder}
						value={apiKeyDraftDisplayValue(form.apiKey)}
					/>
					<ApiKeyHintLine hint={apiKeyHint} />
				</div>
				{!readOnly && hasOwnKey && form.apiKey.mode !== "clear" ? (
					<button
						className="self-start text-error/80 text-xs hover:text-error"
						onClick={() => {
							setForm((prev) => ({ ...prev, apiKey: clearedApiKeyDraft() }));
							void save({ ...form, apiKey: clearedApiKeyDraft() });
						}}
						type="button"
					>
						{t("assistant.fields.apiKey.clear")}
					</button>
				) : null}
			</FormCard>

			<FormCard title={t("assistant.cards.models")}>
				<Field
					hint={<FieldHintLine hint={chatModelHint} />}
					id={chatModelId}
					label={t("assistant.fields.chatModel.label")}
				>
					<input
						className="w-full rounded-md border border-base-300 bg-base-100 px-2 py-1.5 font-mono text-sm outline-none focus-visible:border-primary"
						disabled={readOnly}
						id={chatModelId}
						onBlur={handlePlainBlur}
						onChange={(event) => setForm((prev) => ({ ...prev, chatModel: event.target.value }))}
						placeholder={t("assistant.fields.chatModel.placeholder")}
						spellCheck={false}
						type="text"
						value={form.chatModel}
					/>
				</Field>
				<Field
					hint={<FieldHintLine hint={embedModelHint} />}
					id={embedModelId}
					label={t("assistant.fields.embedModel.label")}
				>
					<input
						className="w-full rounded-md border border-base-300 bg-base-100 px-2 py-1.5 font-mono text-sm outline-none focus-visible:border-primary"
						disabled={readOnly}
						id={embedModelId}
						onBlur={handlePlainBlur}
						onChange={(event) => setForm((prev) => ({ ...prev, embedModel: event.target.value }))}
						placeholder={t("assistant.fields.embedModel.placeholder")}
						spellCheck={false}
						type="text"
						value={form.embedModel}
					/>
				</Field>
			</FormCard>

			<FormCard title={t("assistant.cards.advanced")}>
				<Field
					hint={<FieldHintLine hint={requestTimeoutHint} />}
					id={requestTimeoutId}
					label={t("assistant.fields.requestTimeoutMs.label")}
				>
					<input
						className="w-full rounded-md border border-base-300 bg-base-100 px-2 py-1.5 text-sm outline-none focus-visible:border-primary"
						disabled={readOnly}
						id={requestTimeoutId}
						min={0}
						onBlur={handlePlainBlur}
						onChange={(event) => setForm((prev) => ({ ...prev, requestTimeoutMs: event.target.value }))}
						placeholder={t("assistant.fields.requestTimeoutMs.placeholder")}
						type="number"
						value={form.requestTimeoutMs}
					/>
				</Field>
				{showPollInterval ? (
					<Field
						hint={<FieldHintLine hint={pollIntervalHint} />}
						id={pollIntervalId}
						label={t("assistant.fields.pollIntervalMs.label")}
					>
						<input
							className="w-full rounded-md border border-base-300 bg-base-100 px-2 py-1.5 text-sm outline-none focus-visible:border-primary"
							disabled={readOnly}
							id={pollIntervalId}
							min={0}
							onBlur={handlePlainBlur}
							onChange={(event) => setForm((prev) => ({ ...prev, pollIntervalMs: event.target.value }))}
							placeholder={t("assistant.fields.pollIntervalMs.placeholder")}
							type="number"
							value={form.pollIntervalMs}
						/>
					</Field>
				) : null}
			</FormCard>
		</div>
	);
}
