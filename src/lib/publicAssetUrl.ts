/**
 * Build an app-relative URL for an asset served from the public/ directory,
 * honoring the configured Vite base path (e.g. "/" locally, "/repo/" on GitHub
 * Pages). Pure: no DOM access, no side effects.
 *
 * @param path     Asset path relative to the public root (e.g. "data/x.json").
 *                 A leading slash is tolerated and stripped. Querystrings and
 *                 fragments are preserved. An absolute http(s) URL is returned
 *                 unchanged.
 * @param baseUrl  The Vite base path. Defaults to import.meta.env.BASE_URL.
 *                 Empty/nullish falls back to "/". Leading/trailing slashes are
 *                 normalized so the join never produces a double slash.
 */
export function publicAssetUrl(
  path: string,
  baseUrl: string = import.meta.env.BASE_URL,
): string {
  // Leave already-absolute URLs untouched.
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  // Normalize the base: fall back to "/", ensure a single leading and trailing slash.
  let base = baseUrl && baseUrl.length > 0 ? baseUrl : "/"
  if (!base.startsWith("/")) {
    base = "/" + base
  }
  if (!base.endsWith("/")) {
    base = base + "/"
  }

  // Strip any leading slash from the asset path so the join has no double slash.
  const relativePath = path.startsWith("/") ? path.slice(1) : path

  return base + relativePath
}
