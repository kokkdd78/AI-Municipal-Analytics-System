import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function readProjectFile(...pathParts: string[]): string {
  return readFileSync(join(projectRoot, ...pathParts), "utf8")
}

describe("Phase 2A database schema", () => {
  it("defines the approved normalized entities and exact mapped enum values", () => {
    const schema = readProjectFile("prisma", "schema.prisma")

    for (const model of [
      "User",
      "Department",
      "District",
      "Report",
      "Attachment",
      "Vote",
      "Suggestion",
      "SuggestionVote",
      "WorkOrder",
      "CrewAssignment",
      "StatusHistory",
      "WorkOrderStatusHistory",
      "AuditLog",
      "AuthSession",
      "AuthAccount",
      "AuthVerification",
      "AuthRateLimit",
    ]) {
      expect(schema).toContain(`model ${model} {`)
    }

    expect(schema).toMatch(/enum UserRole \{[\s\S]*Citizen[\s\S]*Manager[\s\S]*Crew[\s\S]*\}/)
    expect(schema).toContain('IN_PROGRESS @map("in-progress")')
    expect(schema).toContain('COMPLETION_EVIDENCE @map("completion-evidence")')
    expect(schema).toContain('UNDER_REVIEW @map("Under Review")')
    expect(schema).toContain('COMPLETED @map("completed")')
    expect(schema).toContain('HIGH   @map("High")')
  })

  it("keeps categories as indexed text and enforces relational uniqueness", () => {
    const schema = readProjectFile("prisma", "schema.prisma")

    expect(schema.match(/category\s+String/g)).toHaveLength(2)
    expect(schema.match(/@@index\(\[category\]\)/g)).toHaveLength(2)
    expect(schema).toContain("@@unique([reportId, userId])")
    expect(schema).toContain("@@unique([suggestionId, userId])")
    expect(schema).toContain("@@unique([workOrderId, crewUserId])")
  })

  it("includes reviewed SQL constraints for text, coordinates, and imported votes", () => {
    const migration = readProjectFile(
      "prisma",
      "migrations",
      "20260812180000_phase_2a_foundation",
      "migration.sql",
    )

    for (const constraint of [
      "users_name_nonblank",
      "reports_title_nonblank",
      "reports_description_nonblank",
      "reports_category_nonblank",
      "reports_latitude_valid",
      "reports_longitude_valid",
      "reports_imported_vote_baseline_nonnegative",
      "suggestions_title_nonblank",
      "suggestions_latitude_valid",
      "suggestions_longitude_valid",
      "suggestions_imported_vote_baseline_nonnegative",
      "attachments_url_nonblank",
      "work_orders_title_nonblank",
      "audit_logs_action_nonblank",
    ]) {
      expect(migration).toContain(`CONSTRAINT "${constraint}"`)
    }
  })

  it("enforces attachment and work-order report consistency in a forward migration", () => {
    const schema = readProjectFile("prisma", "schema.prisma")
    const migration = readProjectFile(
      "prisma",
      "migrations",
      "20260812210000_phase_2a_integrity_fixes",
      "migration.sql",
    )

    expect(schema).toContain("@@unique([id, reportId])")
    expect(schema).toContain("fields: [workOrderId, workOrderReportId]")
    expect(schema).toContain("references: [id, reportId]")
    expect(migration).toContain('CONSTRAINT "attachments_work_order_report_consistent"')
    expect(migration).toContain('FOREIGN KEY ("workOrderId", "workOrderReportId")')
    expect(migration).toContain('REFERENCES "work_orders"("id", "reportId")')
    expect(migration).not.toMatch(/DROP\s+(TABLE|SCHEMA)/i)
  })

  it("uses direct migration and test URLs while keeping runtime Prisma server-only", () => {
    const productionConfig = readProjectFile("prisma.config.ts")
    const testConfig = readProjectFile("prisma.test.config.ts")
    const runtimeClient = readProjectFile("lib", "db", "prisma.ts")
    const environmentExample = readProjectFile(".env.example")
    const gitignore = readProjectFile(".gitignore")

    expect(productionConfig).toContain('env("DIRECT_URL")')
    expect(testConfig).toContain("requireSafeTestDatabaseUrl()")
    expect(runtimeClient).toContain('import "server-only"')
    expect(runtimeClient).toContain("process.env.DATABASE_URL")
    expect(runtimeClient).not.toContain("DIRECT_URL")
    expect(runtimeClient).not.toContain("TEST_DATABASE_URL")
    expect(environmentExample).not.toContain("neon.tech")
    expect(gitignore).toContain("!.env.example")
    expect(gitignore).toContain("generated/prisma/")
  })

  it("adds the Better Auth foundation through a safe forward migration", () => {
    const schema = readProjectFile("prisma", "schema.prisma")
    const migration = readProjectFile(
      "prisma",
      "migrations",
      "20260812230000_phase_2b_authentication",
      "migration.sql",
    )

    expect(schema).toContain("authEmail           String   @unique")
    expect(schema).toContain("authUsername        String?  @unique")
    expect(schema).toContain("isActive            Boolean  @default(true)")
    expect(migration.indexOf('ADD COLUMN "authEmail" TEXT')).toBeLessThan(
      migration.indexOf('UPDATE "users"'),
    )
    expect(migration.indexOf('UPDATE "users"')).toBeLessThan(
      migration.indexOf('ALTER COLUMN "authEmail" SET NOT NULL'),
    )
    expect(migration).toContain('CREATE TABLE "auth_sessions"')
    expect(migration).toContain('CREATE TABLE "auth_accounts"')
    expect(migration).toContain('CREATE TABLE "auth_verifications"')
    expect(migration).not.toMatch(/DROP\s+(TABLE|SCHEMA|COLUMN)/i)
  })

  it("adds persistent Better Auth rate limiting through a separate forward migration", () => {
    const schema = readProjectFile("prisma", "schema.prisma")
    const migration = readProjectFile(
      "prisma",
      "migrations",
      "20260812233000_phase_2b_auth_rate_limit_security",
      "migration.sql",
    )

    expect(schema).toMatch(/model AuthRateLimit \{[\s\S]*key\s+String\s+@unique/)
    expect(schema).toMatch(/model AuthRateLimit \{[\s\S]*count\s+Int/)
    expect(schema).toMatch(/model AuthRateLimit \{[\s\S]*lastRequest\s+BigInt/)
    expect(schema).toContain('@@map("auth_rate_limits")')
    expect(migration).toContain('CREATE TABLE "auth_rate_limits"')
    expect(migration).toContain('CREATE UNIQUE INDEX "auth_rate_limits_key_key"')
    expect(migration).toContain('CONSTRAINT "auth_rate_limits_count_nonnegative_check"')
    expect(migration).not.toMatch(/DROP\s+(TABLE|SCHEMA|COLUMN)|TRUNCATE|DELETE\s+FROM/i)
  })
})

describe("test database safety guard", () => {
  const originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  function configureDatabaseUrls(testUrl: string): void {
    process.env.DATABASE_URL = "postgresql://production-pooler.example.test/municipal"
    process.env.DIRECT_URL = "postgresql://production.example.test/municipal"
    process.env.TEST_DATABASE_URL = testUrl
  }

  function expectTestTargetRejected(testUrl: string): void {
    configureDatabaseUrls(testUrl)
    expect(() => requireSafeTestDatabaseUrl()).toThrow(/Refusing database tests|malformed or ambiguous/)
  }

  it("accepts a genuinely separate test branch", () => {
    configureDatabaseUrls("postgresql://test.example.test/municipal")
    expect(requireSafeTestDatabaseUrl()).toBe(process.env.TEST_DATABASE_URL)
  })

  it("rejects an exact production URL", () => {
    configureDatabaseUrls("postgresql://production.example.test/municipal")
    expect(() => requireSafeTestDatabaseUrl()).toThrow(/Refusing database tests/)
  })

  it("rejects percent-encoded database-name aliases", () => {
    expectTestTargetRejected("postgresql://production.example.test/%6dunicipal")
  })

  it("rejects trailing-dot and hostname-case aliases", () => {
    expectTestTargetRejected("postgresql://PRODUCTION.EXAMPLE.TEST./municipal")
  })

  it("rejects explicit versus implicit default-port aliases", () => {
    expectTestTargetRejected("postgresql://production.example.test:5432/municipal")
  })

  it("ignores irrelevant query-string and protocol-alias differences", () => {
    expectTestTargetRejected("postgres://production.example.test/municipal?connect_timeout=10&sslmode=require")
  })

  it("rejects Neon pooled and direct hostname aliases", () => {
    process.env.DATABASE_URL = "postgresql://ep-municipal-pooler.eu-central-1.aws.neon.tech/municipal"
    process.env.DIRECT_URL = "postgresql://ep-municipal.eu-central-1.aws.neon.tech/municipal"
    process.env.TEST_DATABASE_URL = "postgresql://ep-municipal-pooler.eu-central-1.aws.neon.tech/municipal"

    expect(() => requireSafeTestDatabaseUrl()).toThrow(/Refusing database tests/)
  })

  it.each([
    "postgresql://test.example.test,production.example.test/municipal",
    "postgresql://production.example.test,test.example.test/municipal",
    "postgresql://test.example.test,production.example.test,other.example.test/municipal",
    "postgresql://test.example.test:5432,production.example.test:5432/municipal",
    "postgresql://test.example.test%2Cproduction.example.test/municipal",
    "postgresql://test.example.test%2cproduction.example.test/municipal",
    "postgresql://test.example.test,,production.example.test/municipal",
    "postgresql://,production.example.test/municipal",
    "postgresql://test.example.test,/municipal",
  ])("rejects ambiguous multi-host authorities", (testUrl) => {
    configureDatabaseUrls(testUrl)

    expect(() => requireSafeTestDatabaseUrl()).toThrow(
      "A database environment variable is malformed or ambiguous",
    )
  })

  it.each([
    "postgresql://separate.example.test/municipal",
    "postgresql://192.0.2.10/municipal",
    "postgresql://[2001:db8::10]/municipal",
  ])("accepts valid separate single-host targets", (testUrl) => {
    configureDatabaseUrls(testUrl)

    expect(requireSafeTestDatabaseUrl()).toBe(testUrl)
  })

  it.each([
    "not-a-database-url",
    "https://production.example.test/municipal",
    "postgresql://production.example.test/",
    "postgresql://production.example.test/municipal%2Fshadow",
    "postgresql://production.example.test/municipal?host=test.example.test",
  ])("fails closed for malformed or ambiguous targets", (testUrl) => {
    configureDatabaseUrls(testUrl)

    expect(() => requireSafeTestDatabaseUrl()).toThrow("A database environment variable is malformed or ambiguous")
  })
})
