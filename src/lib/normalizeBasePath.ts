/**
 * Normalize a VITE_BASE_PATH value into a Vite `base`.
 * Unset/empty/"/" → "/" (root, e.g. custom domain at root).
 * A subpath like "lol-pro-meta-tool", "/lol-pro-meta-tool", "/lol-pro-meta-tool/"
 * → "/lol-pro-meta-tool/". Pure, no side effects.
 */
export function normalizeBasePath(raw: string | undefined | null): string {
  const trimmed = raw?.trim()
  if (!trimmed) return "/"
  const stripped = trimmed.replace(/^\/+|\/+$/g, "")
  return stripped ? `/${stripped}/` : "/"
}
