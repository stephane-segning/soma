export type DomainEventSource = "renderer" | "daemon";

export type DomainEventPayload =
  | {
      kind: "spaces-changed";
      source: DomainEventSource;
      atMs: number;
      reason?: string;
    }
  | {
      kind: "space-changed";
      source: DomainEventSource;
      atMs: number;
      spaceId: string;
      reason?: string;
    }
  | {
      kind: "pages-changed";
      source: DomainEventSource;
      atMs: number;
      spaceId: string;
      reason?: string;
    }
  | {
      kind: "document-changed";
      source: DomainEventSource;
      atMs: number;
      spaceId: string;
      documentId: string;
      reason?: string;
    };

export type AgentProvider = "agentd" | "openai-compatible";

export type AgentModelPayload = {
  name: string;
  kind: "chat" | "embed" | "unknown";
  path: string;
  loaded: boolean;
  sizeBytes?: number;
};

export type AgentRuntimeEventPayload =
  | {
      kind: "ready";
      atMs: number;
      provider: AgentProvider;
      baseUrl: string;
    }
  | {
      kind: "status";
      atMs: number;
      provider: AgentProvider;
      baseUrl: string;
      models: AgentModelPayload[];
    }
  | {
      kind: "error";
      atMs: number;
      provider: AgentProvider;
      baseUrl: string;
      error: string;
    };

export function isDomainEventPayload(value: unknown): value is DomainEventPayload {
  return parseDomainEventPayload(value) !== null;
}

export function parseDomainEventPayload(value: unknown): DomainEventPayload | null {
  if (!isRecord(value)) return null;

  const kind = normalizeString(value.kind);
  const source = parseDomainEventSource(value.source);
  const atMs = parseAtMs(value.atMs);
  const reason = parseOptionalString(value.reason);
  if (!kind || !source || atMs === null) return null;

  if (kind === "spaces-changed") {
    return {
      kind,
      source,
      atMs,
      reason
    };
  }

  if (kind === "space-changed" || kind === "pages-changed") {
    const spaceId = normalizeString(value.spaceId);
    if (!spaceId) return null;
    return {
      kind,
      source,
      atMs,
      spaceId,
      reason
    };
  }

  if (kind === "document-changed") {
    const spaceId = normalizeString(value.spaceId);
    const documentId = normalizeString(value.documentId);
    if (!spaceId || !documentId) return null;
    return {
      kind,
      source,
      atMs,
      spaceId,
      documentId,
      reason
    };
  }

  return null;
}

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

  if (kind === "ready") {
    return {
      kind,
      atMs,
      provider,
      baseUrl
    };
  }

  if (kind === "status") {
    if (!Array.isArray(value.models)) return null;
    const models = value.models
      .map(parseAgentModelPayload)
      .filter((record): record is AgentModelPayload => record !== null);

    return {
      kind,
      atMs,
      provider,
      baseUrl,
      models
    };
  }

  if (kind === "error") {
    const error = normalizeString(value.error);
    if (!error) return null;
    return {
      kind,
      atMs,
      provider,
      baseUrl,
      error
    };
  }

  return null;
}

function parseDomainEventSource(value: unknown): DomainEventSource | null {
  if (value === "renderer" || value === "daemon") return value;
  return null;
}

function parseAgentProvider(value: unknown): AgentProvider | null {
  if (value === "agentd" || value === "openai-compatible") {
    return value;
  }
  return null;
}

function parseAgentModelPayload(value: unknown): AgentModelPayload | null {
  if (!isRecord(value)) return null;
  const name = normalizeString(value.name);
  const kind = parseModelKind(value.kind);
  const path = normalizeString(value.path);
  const loaded = typeof value.loaded === "boolean" ? value.loaded : false;
  const sizeBytes = typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes)
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

function parseModelKind(value: unknown): AgentModelPayload["kind"] | null {
  if (value === "chat" || value === "embed" || value === "unknown") return value;
  return null;
}

function parseAtMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
