/**
 * Small, pure helpers for turning a failed runtime data fetch into a safe,
 * user-facing error state. No DOM access, no side effects, no logging.
 *
 * Safety rules baked in here:
 *  - Never expose full response bodies, JSON payloads, fetch URLs, auth headers
 *    or env values. Only a short HTTP status or error name/message is kept.
 *  - Long messages are truncated so a stray payload can never flood the UI.
 */

/** Which runtime data source a load error refers to. */
export type DataLoadErrorKind = "matches" | "syncReport"

/** A safe, user-facing description of a failed data load. */
export interface DataLoadError {
  kind: DataLoadErrorKind
  /**
   * Short, safe technical detail (e.g. "HTTP 404" or "SyntaxError: ..."), never
   * a payload, URL or secret.
   */
  detail: string
  /**
   * Critical errors block the real dataset and warrant a prominent message.
   * Non-critical errors (e.g. the sync report) are warnings only.
   */
  critical: boolean
}

/** Outcome of a single load attempt, used to derive the error state. */
export type DataLoadEvent =
  | { type: "success" }
  | { type: "error"; error: unknown }

/** Upper bound for any user-facing detail string. */
const MAX_DETAIL_LENGTH = 200

function truncate(value: string): string {
  if (value.length <= MAX_DETAIL_LENGTH) return value
  return value.slice(0, MAX_DETAIL_LENGTH) + "…"
}

/**
 * Derive a short, safe message from an unknown thrown/rejected value.
 * Handles the shapes our fetch chain can reject with:
 *  - a numeric HTTP status (from `Promise.reject(response.status)`)
 *  - an `Error` (network `TypeError`, JSON `SyntaxError`, …) — name + message only
 *  - a non-empty string
 * Anything else falls back to a generic message.
 */
export function toSafeErrorMessage(err: unknown): string {
  if (typeof err === "number" && Number.isFinite(err)) {
    return `HTTP ${err}`
  }

  if (err instanceof Error) {
    const name = err.name || "Error"
    const message = (err.message || "").trim()
    // Deliberately ignore err.stack and any extra fields to avoid leaking paths.
    return truncate(message ? `${name}: ${message}` : name)
  }

  if (typeof err === "string" && err.trim().length > 0) {
    return truncate(err.trim())
  }

  return "Unknown error"
}

/** Match data is essential; the sync report is supplementary. */
export function isCriticalDataLoadError(kind: DataLoadErrorKind): boolean {
  return kind === "matches"
}

/** Build a safe {@link DataLoadError} from a thrown/rejected value. */
export function createDataLoadError(
  kind: DataLoadErrorKind,
  err: unknown,
): DataLoadError {
  return {
    kind,
    detail: toSafeErrorMessage(err),
    critical: isCriticalDataLoadError(kind),
  }
}

/**
 * Map the outcome of a load attempt to an error state. A successful load
 * clears the error (returns null); a failure yields a safe {@link DataLoadError}.
 */
export function reduceDataLoadError(
  kind: DataLoadErrorKind,
  event: DataLoadEvent,
): DataLoadError | null {
  if (event.type === "error") {
    return createDataLoadError(kind, event.error)
  }
  return null
}
