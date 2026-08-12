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
})
