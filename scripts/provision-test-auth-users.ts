import "dotenv/config"

import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url.ts"
import { provisionTestCredential } from "./test-auth-provisioning.ts"

function requiredTestPassword(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error("Required test credential configuration is missing")
  return value
}

function requiredTestValue(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error("Required test credential configuration is missing")
  return value
}

async function main(): Promise<void> {
  requireSafeTestDatabaseUrl()
  await provisionTestCredential(
    "demo-citizen",
    requiredTestPassword("TEST_CITIZEN_PASSWORD"),
    requiredTestValue("TEST_CITIZEN_PHONE"),
  )
  await provisionTestCredential("demo-manager", requiredTestPassword("TEST_MANAGER_PASSWORD"))
  await provisionTestCredential("demo-crew", requiredTestPassword("TEST_CREW_PASSWORD"))
  console.log(JSON.stringify({ provisionedUsers: 3 }))
}

void main().catch((error: unknown) => {
  void error
  console.error("Test credential provisioning failed")
  process.exitCode = 1
})
