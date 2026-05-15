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
