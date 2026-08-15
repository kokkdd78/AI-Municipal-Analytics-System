import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  APP_STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  migrateLegacyAppStorage,
  type ClientStorage,
} from "../lib/client-storage"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry)
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : []
  })
}

const applicationFiles = ["app", "components", "context", "lib", "types"]
  .flatMap((directory) => collectSourceFiles(join(projectRoot, directory)))

class MemoryStorage implements ClientStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe("Phase 1 architecture guardrails", () => {
  it("declares the Report domain interface only in the canonical model", () => {
    const declarations = applicationFiles.filter((file) =>
      /(?:export\s+)?interface\s+Report\s*\{/.test(readFileSync(file, "utf8")),
    )

    expect(declarations.map((file) => relative(projectRoot, file))).toEqual([
      join("types", "domain.ts"),
    ])
  })

  it("keeps browser storage access behind one temporary storage module and finishes on the canonical key", () => {
    const directStorageUsers = applicationFiles.filter((file) =>
      /localStorage\.(?:getItem|setItem|removeItem)/.test(readFileSync(file, "utf8")),
    )

    expect(directStorageUsers.map((file) => relative(projectRoot, file))).toEqual([])

    const storageSource = readFileSync(join(projectRoot, "lib", "client-storage.ts"), "utf8")
    expect(storageSource).toContain('APP_STORAGE_KEY = "smartMunicipalAssistant"')

    const storage = new MemoryStorage()
    storage.setItem("userRole", "Citizen")
    migrateLegacyAppStorage(storage)

    expect(storage.getItem(APP_STORAGE_KEY)).not.toBeNull()
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      expect(storage.getItem(legacyKey)).toBeNull()
    }
  })

  it("retains the Citizen, Manager, and Field Crew feature screens", () => {
    const requiredScreens = [
      "components/citizen-app.tsx",
      "components/map-screen.tsx",
      "components/suggestions-screen.tsx",
      "components/manager-dashboard.tsx",
      "components/work-orders-screen.tsx",
      "components/crew-task-list.tsx",
      "components/crew-route-screen.tsx",
      "components/task-execution-screen.tsx",
    ]

    for (const screen of requiredScreens) {
      expect(existsSync(join(projectRoot, screen))).toBe(true)
    }
  })

  it("keeps Phase 2B2B client authentication server-authoritative and storage v2 isolated", () => {
    const storageSource = readFileSync(join(projectRoot, "lib", "client-storage.ts"), "utf8")
    const authContextSource = readFileSync(join(projectRoot, "context", "auth-context.tsx"), "utf8")
    const citizenLoginSource = readFileSync(join(projectRoot, "components", "login-screen.tsx"), "utf8")
    const employeeLoginSource = readFileSync(
      join(projectRoot, "components", "employee-login-screen.tsx"),
      "utf8",
    )
    const registrationSource = readFileSync(join(projectRoot, "components", "sign-up-screen.tsx"), "utf8")
    const authClientSource = readFileSync(join(projectRoot, "lib", "auth", "client.ts"), "utf8")

    expect(storageSource).toContain("version: 2")
    expect(storageSource).toContain("profilesByUserId")
    expect(authContextSource).not.toContain("setUserRole")
    expect(authContextSource).not.toContain("storedState.role")
    expect(authContextSource).toContain("getMunicipalSession")
    expect(citizenLoginSource).not.toMatch(/InputOTP|one-time|verification code/i)
    expect(citizenLoginSource).toContain("loginCitizen")
    expect(registrationSource).not.toMatch(/InputOTP|one-time|verification code/i)
    expect(registrationSource).toContain("JEDDAH_DISTRICTS")
    expect(registrationSource).toContain("registerCitizen")
    expect(employeeLoginSource).not.toMatch(/employeeRole|setEmployeeRole|Manager<\/span>|Field Crew<\/span>/)
    expect(employeeLoginSource).toContain("loginStaff")
    expect(authClientSource).toContain('MUNICIPAL_AUTH_ENDPOINT = "/api/auth/municipal"')
    expect(authClientSource).not.toMatch(/better-auth|generated\/prisma|@\/lib\/db|identifiers/)

    const protectedWrappers = [
      "app/citizen-app/page.tsx",
      "app/map/page.tsx",
      "app/my-reports/page.tsx",
      "app/report/page.tsx",
      "app/report-success/page.tsx",
      "app/report/track/[id]/page.tsx",
      "app/manager/page.tsx",
      "app/crew/page.tsx",
    ]
    for (const page of protectedWrappers) {
      expect(readFileSync(join(projectRoot, page), "utf8")).toContain("requirePageRole")
    }

    const municipalClientFiles = [
      ...collectSourceFiles(join(projectRoot, "components")),
      ...collectSourceFiles(join(projectRoot, "context")),
      join(projectRoot, "lib", "client-storage.ts"),
      join(projectRoot, "lib", "auth", "client.ts"),
    ]
    for (const file of municipalClientFiles) {
      expect(readFileSync(file, "utf8")).not.toMatch(/(?:@\/lib\/db\/prisma|@prisma\/client|generated\/prisma)/)
    }
  })
})
