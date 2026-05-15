import {
  isRecord,
  normalizeString,
  parseAgentModelPayload,
  parseAgentProvider,
  parseAtMs
} from "./parsing";
import type { AgentModelPayload, AgentRuntimeEventPayload } from "./types";

export function isAgentRuntimeEventPayload(value: unknown): value is AgentRuntimeEventPayload {
  return parseAgentRuntimeEventPayload(value) !== null;
}

export function parseAgentRuntimeEventPayload(value: unknown): AgentRuntimeEventPayload | null {
  if (!isRecord(value)) return null;

  const kind = normalizeString(value.kind);
  const atMs = parseAtMs(value.atMs);
  const provider = parseAgentProvider(value.provider);
  const baseUrl = normalizeString(value.baseUrl);
  if (!kind || atMs === null || !provider || !baseUrl) return null;

  if (kind === "ready") return { kind, atMs, provider, baseUrl };

  if (kind === "status") {
    if (!Array.isArray(value.models)) return null;
    return {
      kind,
      atMs,
      provider,
      baseUrl,
      models: value.models
        .map(parseAgentModelPayload)
        .filter((record): record is AgentModelPayload => record !== null)
    };
  }

  if (kind === "error") {
    const error = normalizeString(value.error);
    if (!error) return null;
    return { kind, atMs, provider, baseUrl, error };
  }

  return null;
}
