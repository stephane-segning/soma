import type { AgentModelPayload, AgentProvider, DomainEventSource } from "./types";

export function parseDomainEventSource(value: unknown): DomainEventSource | null {
  if (value === "renderer" || value === "daemon") return value;
  return null;
}

export function parseAgentProvider(value: unknown): AgentProvider | null {
  if (value === "agentd" || value === "openai-compatible") return value;
  return null;
}

export function parseAgentModelPayload(value: unknown): AgentModelPayload | null {
  if (!isRecord(value)) return null;
  const name = normalizeString(value.name);
  const kind = parseModelKind(value.kind);
  const path = normalizeString(value.path);
  const loaded = typeof value.loaded === "boolean" ? value.loaded : false;
  const sizeBytes =
    typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes)
      ? value.sizeBytes
      : undefined;
  if (!name || !kind || !path) return null;

  return {
    name,
    kind,
    path,
    loaded,
    sizeBytes
  };
}

export function parseAtMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

export function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseModelKind(value: unknown): AgentModelPayload["kind"] | null {
  if (value === "chat" || value === "embed" || value === "unknown") return value;
  return null;
}
