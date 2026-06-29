/**
 * Type guard for a non-null plain-ish object (i.e. "object but not array").
 * Mirrors the inline guards previously duplicated in validateMatches.ts and
 * notes/storage.ts: rejects null, undefined, primitives and arrays; accepts any
 * other object (including Date / class instances — deliberately NOT tightened,
 * to preserve existing behavior). Pure, no side effects.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
