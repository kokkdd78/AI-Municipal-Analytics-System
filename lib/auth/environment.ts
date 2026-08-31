import { isIP } from "node:net"

export interface AuthRuntimeEnvironment {
  baseURL: string
  secret: string
  trustedOrigins: string[]
  trustedProxyCidrs: string[]
  secureCookies: boolean
}

type AuthEnvironmentSource = Partial<
  Record<
    | "BETTER_AUTH_SECRET"
    | "BETTER_AUTH_URL"
    | "BETTER_AUTH_TRUSTED_ORIGINS"
    | "AUTH_TRUSTED_PROXY_CIDRS"
    | "VERCEL"
    | "NODE_ENV",
    string | undefined
  >
>

function invalidConfiguration(): never {
  throw new Error("The authentication environment configuration is invalid")
}

function requireValue(value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized) invalidConfiguration()
  return normalized
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.")
  )
}

function parseExactOrigin(value: string, production: boolean): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    invalidConfiguration()
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    (production && parsed.protocol !== "https:") ||
    (production && isLocalHostname(parsed.hostname)) ||
    (!production && parsed.protocol === "http:" && !isLocalHostname(parsed.hostname)) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.includes("*") ||
    parsed.origin === "null"
  ) {
    invalidConfiguration()
  }

  return parsed.origin
}

function validProxyAddress(value: string): boolean {
  const parts = value.split("/")
  if (parts.length > 2 || parts[0] === "") return false

  const addressFamily = isIP(parts[0])
  if (addressFamily === 0) return false
  if (parts.length === 1) return true

  const prefix = parts[1]
  if (!/^(0|[1-9]\d*)$/.test(prefix)) return false
  const prefixLength = Number(prefix)
  return prefixLength <= (addressFamily === 4 ? 32 : 128)
}

function parseTrustedProxyCidrs(
  value: string | undefined,
  production: boolean,
  vercel: boolean,
): string[] {
  const rawValue = value?.trim()
  if (!rawValue) {
    // Direct Vercel deployments overwrite X-Forwarded-For with one client IP.
    // Better Auth accepts only a single valid address when trustedProxies is empty.
    if (production && !vercel) invalidConfiguration()
    return []
  }

  const entries = rawValue.split(",").map((entry) => entry.trim())
  if (entries.some((entry) => !validProxyAddress(entry))) invalidConfiguration()
  return [...new Set(entries)]
}

export function readAuthRuntimeEnvironment(
  environment: AuthEnvironmentSource = process.env,
): AuthRuntimeEnvironment {
  const production = environment.NODE_ENV === "production"
  const secret = requireValue(environment.BETTER_AUTH_SECRET)
  if (secret.length < 32) invalidConfiguration()

  const baseURL = parseExactOrigin(requireValue(environment.BETTER_AUTH_URL), production)
  const rawOrigins = requireValue(environment.BETTER_AUTH_TRUSTED_ORIGINS)
  const trustedOrigins = [
    ...new Set(rawOrigins.split(",").map((value) => parseExactOrigin(value.trim(), production))),
  ]
  const trustedProxyCidrs = parseTrustedProxyCidrs(
    environment.AUTH_TRUSTED_PROXY_CIDRS,
    production,
    environment.VERCEL === "1",
  )

  if (trustedOrigins.length === 0 || !trustedOrigins.includes(baseURL)) invalidConfiguration()

  return {
    baseURL,
    secret,
    trustedOrigins,
    trustedProxyCidrs,
    secureCookies: production,
  }
}
