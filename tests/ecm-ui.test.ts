import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("ECM archive UI", () => {
  it("uses the Manager archive APIs and has no prototype archive records", () => {
    const source = readFileSync("components/archive-screen.tsx", "utf8")
    expect(source).toContain("getEligibleArchiveReports")
    expect(source).toContain("getArchives")
    expect(source).toContain("createArchive")
    expect(source).toContain("verifyArchive")
    expect(source).not.toContain("mockArchives")
    expect(source).not.toContain("ECM-2026-DEMO")
  })
})
