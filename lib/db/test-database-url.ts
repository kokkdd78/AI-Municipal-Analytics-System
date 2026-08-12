function requireEnvironmentVariable(name: "DATABASE_URL" | "DIRECT_URL" | "TEST_DATABASE_URL"): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"])
const DATABASE_TARGET_QUERY_PARAMETERS = new Set([
  "database",
  "dbname",
  "host",
  "hostaddr",
  "options",
  "port",
  "service",
  "servicefile",
])

function invalidDatabaseUrl(): never {
  throw new Error("A database environment variable is malformed or ambiguous")
}

function rejectAmbiguousAuthority(connectionString: string): void {
  const schemeMatch = /^[a-z][a-z\d+.-]*:\/\//i.exec(connectionString)
  if (!schemeMatch) invalidDatabaseUrl()

  const authorityStart = schemeMatch[0].length
  const authorityEndOffset = connectionString.slice(authorityStart).search(/[/?#]/)
  const authorityEnd = authorityEndOffset === -1 ? connectionString.length : authorityStart + authorityEndOffset
  const authority = connectionString.slice(authorityStart, authorityEnd)
  if (!authority) invalidDatabaseUrl()

  const firstAt = authority.indexOf("@")
  const lastAt = authority.lastIndexOf("@")
  if (firstAt !== lastAt) invalidDatabaseUrl()

  const rawHostAndPort = authority.slice(lastAt + 1)
  if (!rawHostAndPort) invalidDatabaseUrl()

  let decodedHostAndPort: string
  try {
    decodedHostAndPort = decodeURIComponent(rawHostAndPort)
  } catch {
    invalidDatabaseUrl()
  }

  if (!decodedHostAndPort || decodedHostAndPort.includes(",")) invalidDatabaseUrl()
}

function canonicalHostname(parsed: URL): string {
  let hostname = parsed.hostname.toLowerCase().replace(/\.+$/, "")
  if (!hostname) invalidDatabaseUrl()

  if (hostname.endsWith(".neon.tech")) {
    const labels = hostname.split(".")
    labels[0] = labels[0].replace(/-pooler$/, "")
    hostname = labels.join(".")
  }

  return hostname
}

function canonicalPort(parsed: URL): string {
  if (!parsed.port) return "5432"
  if (!/^\d+$/.test(parsed.port)) invalidDatabaseUrl()

  const port = Number(parsed.port)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) invalidDatabaseUrl()
  return String(port)
}

function canonicalDatabaseName(parsed: URL): string {
  if (!parsed.pathname.startsWith("/") || parsed.pathname.length === 1) invalidDatabaseUrl()

  let database: string
  try {
    database = decodeURIComponent(parsed.pathname.slice(1))
  } catch {
    invalidDatabaseUrl()
  }

  if (
    !database ||
    database === "." ||
    database === ".." ||
    database.includes("/") ||
    database.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(database)
  ) {
    invalidDatabaseUrl()
  }

  return database
}

function databaseIdentity(connectionString: string): string {
  rejectAmbiguousAuthority(connectionString)

  let parsed: URL

  try {
    parsed = new URL(connectionString)
  } catch {
    invalidDatabaseUrl()
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol.toLowerCase()) || parsed.hash) invalidDatabaseUrl()

  for (const key of parsed.searchParams.keys()) {
    if (DATABASE_TARGET_QUERY_PARAMETERS.has(key.toLowerCase())) invalidDatabaseUrl()
  }

  const hostname = canonicalHostname(parsed)
  const port = canonicalPort(parsed)
  const database = canonicalDatabaseName(parsed)

  return `${hostname}:${port}/${database}`
}

export function requireSafeTestDatabaseUrl(): string {
  const testUrl = requireEnvironmentVariable("TEST_DATABASE_URL")
  const runtimeUrl = requireEnvironmentVariable("DATABASE_URL")
  const migrationUrl = requireEnvironmentVariable("DIRECT_URL")
  const testIdentity = databaseIdentity(testUrl)

  if (testIdentity === databaseIdentity(runtimeUrl) || testIdentity === databaseIdentity(migrationUrl)) {
    throw new Error("Refusing database tests because TEST_DATABASE_URL targets the production database")
  }

  return testUrl
}
