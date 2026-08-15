import "dotenv/config"

import { neon } from "@neondatabase/serverless"

import { deriveCitizenAuthIdentity, deriveStaffAuthIdentity } from "../lib/auth/identifiers.ts"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url.ts"

interface UserIdentifierRow {
  phone: string | null
  employeeId: string | null
}

interface PreflightResult {
  branch: "production" | "test"
  authenticationMigrationApplied: boolean
  rateLimitMigrationApplied: boolean
  unexpectedAuthTables: number
  citizenIdentifierCollisions: number
  staffIdentifierCollisions: number
  invalidStoredIdentifiers: number
}

interface MigrationRow {
  migration_name: string
  applied: boolean
}

const AUTH_MIGRATION = "20260812230000_phase_2b_authentication"
const RATE_LIMIT_MIGRATION = "20260812233000_phase_2b_auth_rate_limit_security"
const TARGET_AUTH_TABLES = new Set(["auth_sessions", "auth_accounts", "auth_verifications"])
const TARGET_RATE_LIMIT_TABLES = new Set(["auth_rate_limits"])
const DEFAULT_AUTH_TABLES = new Set([
  "user",
  "session",
  "sessions",
  "account",
  "accounts",
  "verification",
  "verifications",
  "RateLimit",
  "RateLimits",
  "rateLimit",
  "rateLimits",
  "rate_limit",
  "rate_limits",
  "AuthRateLimit",
  "AuthRateLimits",
  "authRateLimit",
  "authRateLimits",
  "auth_rate_limit",
])

function requireMigrationUrl(): string {
  const value = process.env.DIRECT_URL?.trim()
  if (!value) throw new Error("The database preflight configuration is invalid")
  return value
}

function countCollisions(values: string[]): number {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.values()].filter((count) => count > 1).length
}

async function inspectBranch(
  branch: PreflightResult["branch"],
  connectionString: string,
): Promise<PreflightResult> {
  const sql = neon(connectionString)
  const [rawTables, rawMigrations] = await Promise.all([
    sql.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN (
          'auth_sessions', 'auth_accounts', 'auth_verifications', 'auth_rate_limits',
          'user', 'session', 'sessions', 'account', 'accounts', 'verification', 'verifications',
          'RateLimit', 'RateLimits', 'rateLimit', 'rateLimits', 'rate_limit', 'rate_limits',
          'AuthRateLimit', 'AuthRateLimits', 'authRateLimit', 'authRateLimits', 'auth_rate_limit'
        )`,
    [],
    ),
    sql.query(
      `SELECT migration_name,
              finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied
         FROM "_prisma_migrations"
        WHERE migration_name IN ($1, $2)`,
      [AUTH_MIGRATION, RATE_LIMIT_MIGRATION],
    ),
  ])
  const tables = rawTables as unknown as { table_name: string }[]
  const migrations = rawMigrations as unknown as MigrationRow[]
  const users = (await sql.query(
    `SELECT phone, "employeeId"
       FROM users
      WHERE phone IS NOT NULL OR "employeeId" IS NOT NULL`,
    [],
  )) as UserIdentifierRow[]

  const citizenIdentifiers: string[] = []
  const staffIdentifiers: string[] = []
  let invalidStoredIdentifiers = 0

  for (const user of users) {
    if (user.phone) {
      try {
        citizenIdentifiers.push(deriveCitizenAuthIdentity(user.phone).username)
      } catch {
        invalidStoredIdentifiers += 1
      }
    }
    if (user.employeeId) {
      try {
        staffIdentifiers.push(deriveStaffAuthIdentity(user.employeeId).username)
      } catch {
        invalidStoredIdentifiers += 1
      }
    }
  }

  const foundTables = new Set(tables.map((table) => table.table_name))
  const authenticationMigrationApplied =
    migrations.find((migration) => migration.migration_name === AUTH_MIGRATION)?.applied === true
  const rateLimitMigrationApplied =
    migrations.find((migration) => migration.migration_name === RATE_LIMIT_MIGRATION)?.applied === true
  const defaultTableCount = [...DEFAULT_AUTH_TABLES].filter((table) => foundTables.has(table)).length
  const targetTableCount = [...TARGET_AUTH_TABLES].filter((table) => foundTables.has(table)).length
  const rateLimitTableCount = [...TARGET_RATE_LIMIT_TABLES].filter((table) => foundTables.has(table)).length
  const unexpectedAuthTables =
    defaultTableCount +
    (authenticationMigrationApplied ? TARGET_AUTH_TABLES.size - targetTableCount : targetTableCount) +
    (rateLimitMigrationApplied ? TARGET_RATE_LIMIT_TABLES.size - rateLimitTableCount : rateLimitTableCount)

  return {
    branch,
    authenticationMigrationApplied,
    rateLimitMigrationApplied,
    unexpectedAuthTables,
    citizenIdentifierCollisions: countCollisions(citizenIdentifiers),
    staffIdentifierCollisions: countCollisions(staffIdentifiers),
    invalidStoredIdentifiers,
  }
}

async function main(): Promise<void> {
  const results = await Promise.all([
    inspectBranch("production", requireMigrationUrl()),
    inspectBranch("test", requireSafeTestDatabaseUrl()),
  ])

  for (const result of results) console.log(JSON.stringify(result))

  if (
    results.some(
      (result) =>
        result.unexpectedAuthTables > 0 ||
        result.citizenIdentifierCollisions > 0 ||
        result.staffIdentifierCollisions > 0 ||
        result.invalidStoredIdentifiers > 0,
    )
  ) {
    throw new Error("The authentication database preflight failed")
  }
}

void main().catch((error: unknown) => {
  void error
  console.error("The authentication database preflight failed")
  process.exitCode = 1
})
