import {
  isRecord,
  normalizeString,
  parseAtMs,
  parseDomainEventSource,
  parseOptionalString
} from "./parsing.ts";
import type { DomainEventPayload } from "./types.ts";

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

  if (kind === "spaces-changed") return { kind, source, atMs, reason };

  if (kind === "space-changed" || kind === "pages-changed") {
    const spaceId = normalizeString(value.spaceId);
    if (!spaceId) return null;
    return { kind, source, atMs, spaceId, reason };
  }

  if (kind === "document-changed") {
    const spaceId = normalizeString(value.spaceId);
    const documentId = normalizeString(value.documentId);
    if (!spaceId || !documentId) return null;
    return { kind, source, atMs, spaceId, documentId, reason };
  }

  return null;
}
