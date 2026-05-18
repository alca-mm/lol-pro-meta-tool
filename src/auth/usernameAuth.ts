const AUTH_DOMAIN = "moon-mothlings.example.com"
const USERNAME_RE = /^[a-z0-9_-]{3,32}$/

export function normalizeUsername(username: string): string {
    return username.trim().toLowerCase()
}

export function isValidUsername(username: string): boolean {
    return USERNAME_RE.test(normalizeUsername(username))
}

export function usernameToAuthEmail(username: string): string {
    return `${normalizeUsername(username)}@${AUTH_DOMAIN}`
}

export function authEmailToUsername(email: string | null | undefined): string {
    if (!email) return ""
    const suffix = `@${AUTH_DOMAIN}`
    if (email.endsWith(suffix)) return email.slice(0, -suffix.length)
    return email
}
