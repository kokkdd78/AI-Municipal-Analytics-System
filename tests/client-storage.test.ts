import { describe, expect, it } from "vitest"

import {
  APP_STORAGE_KEY,
  EMPTY_APP_STORAGE,
  LEGACY_STORAGE_KEYS,
  applyMunicipalSessionProjection,
  clearAppSession,
  getProfileForAuthenticatedUser,
  mergeAppStorage,
  migrateLegacyAppStorage,
  parseAppStorage,
  updateProfileForAuthenticatedUser,
  type ClientStorage,
} from "../lib/client-storage"
import type { AppStorageState } from "../lib/client-storage"

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

const canonicalReport = {
  id: "report-1",
  title: "Pothole",
  description: "Road surface is damaged",
  category: "pothole",
  status: "pending" as const,
  location: { lat: 21.54, lng: 39.17 },
  district: "Al-Naeem",
  createdAt: "2026-08-12T08:00:00.000Z",
  votes: 0,
  authorId: "citizen-1",
  attachments: [],
}

describe("temporary application storage", () => {
  it("uses one stable browser storage key", () => {
    expect(APP_STORAGE_KEY).toBe("smartMunicipalAssistant")
  })

  it("returns the canonical empty state for invalid JSON", () => {
    expect(parseAppStorage("not-json")).toEqual(EMPTY_APP_STORAGE)
  })

  it("preserves report data when another storage field changes", () => {
    const current = { ...EMPTY_APP_STORAGE, reports: [canonicalReport] }
    const next = mergeAppStorage(current, { votedReportIds: [canonicalReport.id] })

    expect(next.reports).toEqual([canonicalReport])
    expect(next.votedReportIds).toEqual([canonicalReport.id])
  })

  it("migrates and deduplicates every baseline legacy storage source", () => {
    const storage = new MemoryStorage()
    storage.setItem("userRole", "Citizen")
    storage.setItem(
      "app_user",
      JSON.stringify({
        name: "Ayman AlJenidi",
        district: "Al-Naeem",
        avatar: "/avatar.jpg",
        role: "citizen",
      }),
    )
    storage.setItem(
      "app_reports",
      JSON.stringify([
        {
          id: "report-1",
          title: "Pothole",
          lat: 21.54,
          lng: 39.17,
          votes: 1,
          status: "pending",
          authorId: "Ayman AlJenidi",
        },
      ]),
    )
    storage.setItem(
      "myReports",
      JSON.stringify([
        {
          id: "report-1",
          title: "Pothole",
          category: "pothole",
          description: "Detailed citizen description",
          latitude: 21.54,
          longitude: 39.17,
          district: "Al-Naeem",
          createdAt: "2026-08-12T08:00:00.000Z",
          votes: 3,
          authorId: "Ayman AlJenidi",
          photoUrl: "data:image/jpeg;base64,photo",
        },
        {
          id: "report-2",
          title: "Broken light",
          issueType: "lighting",
          lat: 21.55,
          lng: 39.18,
          authorId: "Ayman AlJenidi",
        },
      ]),
    )
    storage.setItem("reports", "malformed-json")
    storage.setItem("app_voted_reports", JSON.stringify(["report-1", "report-1", "report-2"]))
    storage.setItem(
      "app_suggestions",
      JSON.stringify([
        {
          id: "suggestion-1",
          title: "New park",
          category: "park",
          lat: 21.56,
          lng: 39.19,
          description: "More green space",
          district: "Al-Naeem",
          createdAt: "2026-08-11T08:00:00.000Z",
          votes: 2,
        },
        {
          id: "suggestion-1",
          title: "New park",
          category: "park",
          lat: 21.56,
          lng: 39.19,
          description: "More green space",
          district: "Al-Naeem",
          createdAt: "2026-08-11T08:00:00.000Z",
          votes: 5,
        },
      ]),
    )
    storage.setItem("app_voted_suggestions", JSON.stringify(["suggestion-1", "suggestion-1"]))

    const migrated = migrateLegacyAppStorage(storage)
    const migratedProfile = Object.values(migrated.profilesByUserId)[0]

    expect(migrated.version).toBe(2)
    expect(migrated.role).toBe("Citizen")
    expect(migratedProfile?.name).toBe("Ayman AlJenidi")
    expect(migrated.reports).toHaveLength(2)
    expect(migrated.reports.find((report) => report.id === "report-1")).toMatchObject({
      description: "Detailed citizen description",
      votes: 3,
      authorId: migratedProfile?.id,
    })
    expect(migrated.reports.find((report) => report.id === "report-1")?.attachments).toHaveLength(1)
    expect(migrated.reports.find((report) => report.id === "report-2")?.authorId).toBe(migratedProfile?.id)
    expect(migrated.votedReportIds).toEqual(["report-1", "report-2"])
    expect(migrated.suggestions).toHaveLength(1)
    expect(migrated.suggestions[0].votes).toBe(5)
    expect(migrated.votedSuggestionIds).toEqual(["suggestion-1"])
    expect(parseAppStorage(storage.getItem(APP_STORAGE_KEY))).toEqual(migrated)

    for (const key of LEGACY_STORAGE_KEYS) {
      expect(storage.getItem(key)).toBeNull()
    }
  })

  it("fills a partial canonical report from its complete legacy match before normalization", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...EMPTY_APP_STORAGE,
        reports: [{ id: "report-1" }],
      }),
    )
    storage.setItem(
      "myReports",
      JSON.stringify([
        {
          id: "report-1",
          title: "Broken streetlight",
          description: "The light has been out for three nights",
          category: "lighting",
          status: "in progress",
          lat: 21.61,
          lng: 39.16,
          district: "Al-Naeem",
          createdAt: "2026-08-10T18:30:00.000Z",
          votes: 4,
          photoUrl: "data:image/jpeg;base64,legacy-photo",
        },
      ]),
    )

    const migrated = migrateLegacyAppStorage(storage)

    expect(migrated.reports).toHaveLength(1)
    expect(migrated.reports[0]).toMatchObject({
      id: "report-1",
      title: "Broken streetlight",
      description: "The light has been out for three nights",
      category: "lighting",
      status: "in-progress",
      location: { lat: 21.61, lng: 39.16 },
      district: "Al-Naeem",
      createdAt: "2026-08-10T18:30:00.000Z",
      votes: 4,
    })
    expect(migrated.reports[0].attachments).toHaveLength(1)
  })

  it("recovers invalid canonical report fields from a valid legacy match before normalization", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...EMPTY_APP_STORAGE,
        reports: [
          {
            id: "report-invalid-fields",
            title: 404,
            description: { invalid: true },
            category: false,
            status: { invalid: true },
            severity: "low",
            location: { lat: "north", lng: false },
            district: 42,
            createdAt: true,
            votes: "many",
            authorId: { id: "not-an-author" },
            attachments: [
              {
                id: "attachment-1",
                name: 17,
                mimeType: { invalid: true },
                url: "data:image/jpeg;base64,evidence",
                kind: false,
              },
            ],
          },
        ],
      }),
    )
    storage.setItem(
      "myReports",
      JSON.stringify([
        {
          id: "report-invalid-fields",
          title: "Legacy pothole title",
          description: "A complete description from legacy storage",
          category: "pothole",
          status: "in progress",
          severity: "high",
          location: { lat: 21.6, lng: 39.2 },
          district: "Al-Rawdah",
          createdAt: "2026-08-09T12:00:00.000Z",
          votes: 6,
          authorId: "citizen-legacy",
          attachments: [
            {
              id: "attachment-1",
              name: "legacy-evidence.jpg",
              mimeType: "image/jpeg",
              url: "data:image/jpeg;base64,evidence",
              kind: "completion-evidence",
            },
          ],
        },
      ]),
    )

    const migrated = migrateLegacyAppStorage(storage)

    expect(migrated.reports[0]).toEqual({
      id: "report-invalid-fields",
      title: "Legacy pothole title",
      description: "A complete description from legacy storage",
      category: "pothole",
      status: "in-progress",
      severity: "low",
      location: { lat: 21.6, lng: 39.2 },
      district: "Al-Rawdah",
      createdAt: "2026-08-09T12:00:00.000Z",
      votes: 6,
      authorId: "citizen-legacy",
      attachments: [
        {
          id: "attachment-1",
          name: "legacy-evidence.jpg",
          mimeType: "image/jpeg",
          url: "data:image/jpeg;base64,evidence",
          kind: "completion-evidence",
        },
      ],
    })
  })

  it("fills a partial canonical user from the richer legacy profile before normalization", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...EMPTY_APP_STORAGE,
        user: { name: "Updated Name" },
      }),
    )
    storage.setItem(
      "app_user",
      JSON.stringify({
        id: "citizen-42",
        name: "Legacy Name",
        phone: "+966500000000",
        district: "Al-Rawdah",
        avatar: "/legacy-avatar.jpg",
        role: "citizen",
      }),
    )

    const migrated = migrateLegacyAppStorage(storage)

    expect(migrated.profilesByUserId["citizen-42"]).toEqual({
      id: "citizen-42",
      name: "Updated Name",
      phone: "+966500000000",
      district: "Al-Rawdah",
      avatar: "/legacy-avatar.jpg",
      role: "Citizen",
    })
  })

  it.each([
    ["uses a valid legacy role when the canonical role is missing", false, null, "Citizen", "Citizen"],
    ["keeps an explicit canonical null role", true, null, "Manager", null],
    ["keeps a valid canonical role", true, "Manager", "Citizen", "Manager"],
    ["uses a valid legacy role when the canonical role is invalid", true, "Auditor", "Crew", "Crew"],
    ["uses null when neither canonical nor legacy roles are valid", true, "Auditor", "Owner", null],
  ])("%s", (_label, hasCanonicalRole, canonicalRole, storedLegacyRole, expectedRole) => {
    const storage = new MemoryStorage()
    const canonicalWithoutRole = {
      version: 1,
      user: null,
      reports: [],
      votedReportIds: [],
      suggestions: [],
      votedSuggestionIds: [],
    }
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify(
        hasCanonicalRole
          ? { ...canonicalWithoutRole, role: canonicalRole }
          : canonicalWithoutRole,
      ),
    )
    storage.setItem("userRole", storedLegacyRole)

    expect(migrateLegacyAppStorage(storage).role).toBe(expectedRole)
  })

  it("is idempotent after the first successful migration", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...EMPTY_APP_STORAGE,
        role: "Citizen",
        user: {
          id: "citizen-1",
          name: "Ayman",
          district: "Al-Naeem",
          avatar: "/avatar.jpg",
          role: "Citizen",
        },
      }),
    )
    storage.setItem("userRole", "Citizen")
    storage.setItem("app_user", JSON.stringify({ name: "Ayman", district: "Al-Naeem", role: "citizen" }))
    storage.setItem("app_reports", JSON.stringify([{ id: "report-1", title: "Pothole", authorId: "Ayman" }]))
    storage.setItem("myReports", JSON.stringify([{ id: "report-1", title: "Pothole", authorId: "Ayman" }]))

    const firstState = migrateLegacyAppStorage(storage)
    const firstCanonicalValue = storage.getItem(APP_STORAGE_KEY)
    const secondState = migrateLegacyAppStorage(storage)

    expect(secondState).toEqual(firstState)
    expect(storage.getItem(APP_STORAGE_KEY)).toBe(firstCanonicalValue)
    expect(secondState.reports).toHaveLength(1)
  })

  it("remains idempotent after enriching partial canonical records", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...EMPTY_APP_STORAGE,
        user: { name: "Updated Name" },
        reports: [{ id: "report-1" }],
      }),
    )
    storage.setItem(
      "app_user",
      JSON.stringify({ id: "citizen-42", name: "Legacy Name", district: "Al-Naeem", avatar: "/avatar.jpg" }),
    )
    storage.setItem(
      "myReports",
      JSON.stringify([{ id: "report-1", title: "Pothole", lat: 21.54, lng: 39.17, status: "resolved" }]),
    )

    const firstState = migrateLegacyAppStorage(storage)
    const firstCanonicalValue = storage.getItem(APP_STORAGE_KEY)
    const secondState = migrateLegacyAppStorage(storage)

    expect(secondState).toEqual(firstState)
    expect(storage.getItem(APP_STORAGE_KEY)).toBe(firstCanonicalValue)
  })

  it("keeps legacy keys when the canonical write fails", () => {
    const values = new Map<string, string>([["userRole", "Citizen"]])
    const storage: ClientStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: () => {
        throw new Error("Storage quota exceeded")
      },
      removeItem: (key) => values.delete(key),
    }

    expect(() => migrateLegacyAppStorage(storage)).not.toThrow()
    expect(storage.getItem("userRole")).toBe("Citizen")
    expect(storage.getItem(APP_STORAGE_KEY)).toBeNull()
  })

  it("preserves the prior v1 envelope and legacy keys when the v2 write fails", () => {
    const originalCanonical = JSON.stringify({
      version: 1,
      role: "Citizen",
      user: { id: "citizen-1", name: "Ayman", district: "Al-Naeem", avatar: "/avatar.jpg" },
      reports: [canonicalReport],
      votedReportIds: ["report-1"],
      suggestions: [],
      votedSuggestionIds: [],
    })
    const values = new Map<string, string>([
      [APP_STORAGE_KEY, originalCanonical],
      ["app_voted_reports", JSON.stringify(["report-2"])],
    ])
    const storage: ClientStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: () => {
        throw new Error("Storage quota exceeded")
      },
      removeItem: (key) => values.delete(key),
    }

    const migrated = migrateLegacyAppStorage(storage)

    expect(migrated.version).toBe(2)
    expect(migrated.votedReportIds).toEqual(["report-1", "report-2"])
    expect(storage.getItem(APP_STORAGE_KEY)).toBe(originalCanonical)
    expect(storage.getItem("app_voted_reports")).toBe(JSON.stringify(["report-2"]))
  })

  it("clears only the role when signing out", () => {
    const storage = new MemoryStorage()
    const state: AppStorageState = {
      version: 2,
      role: "Citizen",
      profilesByUserId: {
        "citizen-1": {
          id: "citizen-1",
          name: "Ayman",
          district: "Al-Naeem",
          avatar: "/avatar.jpg",
          role: "Citizen",
        },
      },
      activeProfileId: "citizen-1",
      reports: [canonicalReport],
      votedReportIds: [canonicalReport.id],
      suggestions: [
        {
          id: "suggestion-1",
          title: "New park",
          category: "park",
          description: "More green space",
          location: { lat: 21.56, lng: 39.19 },
          district: { id: "al-naeem", name: "Al-Naeem", arabic: "" },
          createdAt: "2026-08-11T08:00:00.000Z",
          votes: 2,
        },
      ],
      votedSuggestionIds: ["suggestion-1"],
    }
    storage.setItem(APP_STORAGE_KEY, JSON.stringify(state))

    const signedOut = clearAppSession(storage)
    const reread = migrateLegacyAppStorage(storage)

    expect(signedOut.role).toBeNull()
    expect(reread.role).toBeNull()
    expect(signedOut.activeProfileId).toBeNull()
    expect(reread.activeProfileId).toBeNull()
    expect(reread.profilesByUserId).toEqual(state.profilesByUserId)
    expect(reread.reports).toEqual(state.reports)
    expect(reread.votedReportIds).toEqual(state.votedReportIds)
    expect(reread.suggestions).toEqual(state.suggestions)
    expect(reread.votedSuggestionIds).toEqual(state.votedSuggestionIds)
  })

  it("migrates a v1 profile into the v2 profile map losslessly and idempotently", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        role: "Citizen",
        user: {
          id: "demo-citizen",
          name: "Local Demo Name",
          phone: "+966500000001",
          district: "Al-Naeem",
          avatar: "data:image/png;base64,avatar",
          role: "Citizen",
        },
        reports: [{ ...canonicalReport, authorId: "demo-citizen" }],
        votedReportIds: ["report-1"],
        suggestions: [],
        votedSuggestionIds: ["suggestion-1"],
      }),
    )

    const first = migrateLegacyAppStorage(storage)
    const serialized = storage.getItem(APP_STORAGE_KEY)
    const second = migrateLegacyAppStorage(storage)

    expect(first).toEqual(second)
    expect(storage.getItem(APP_STORAGE_KEY)).toBe(serialized)
    expect(first.version).toBe(2)
    expect(first.activeProfileId).toBeNull()
    expect(first.profilesByUserId["demo-citizen"]).toMatchObject({
      id: "demo-citizen",
      name: "Local Demo Name",
      phone: "+966500000001",
      district: "Al-Naeem",
      avatar: "data:image/png;base64,avatar",
    })
    expect(first.reports[0]).toEqual({ ...canonicalReport, authorId: "demo-citizen" })
    expect(first.votedReportIds).toEqual(["report-1"])
    expect(first.votedSuggestionIds).toEqual(["suggestion-1"])
  })

  it("fills a partial v2 profile from the richer legacy user before applying defaults", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        role: null,
        profilesByUserId: { "citizen-42": { id: "citizen-42", name: "Local Name" } },
        activeProfileId: null,
        reports: [],
        votedReportIds: [],
        suggestions: [],
        votedSuggestionIds: [],
      }),
    )
    storage.setItem(
      "app_user",
      JSON.stringify({
        id: "citizen-42",
        name: "Legacy Name",
        phone: "+966500000042",
        district: "Al-Rawdah",
        avatar: "/richer-avatar.jpg",
        role: "Citizen",
      }),
    )

    const profile = migrateLegacyAppStorage(storage).profilesByUserId["citizen-42"]
    expect(profile).toEqual({
      id: "citizen-42",
      name: "Local Name",
      phone: "+966500000042",
      district: "Al-Rawdah",
      avatar: "/richer-avatar.jpg",
      role: "Citizen",
    })
  })

  it("binds only an exact Citizen ID and never claims another profile or report", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...EMPTY_APP_STORAGE,
        profilesByUserId: {
          "legacy-citizen": {
            id: "legacy-citizen",
            name: "Legacy Citizen",
            phone: "+966500000010",
            district: "Al-Balad",
            avatar: "/legacy.jpg",
            role: "Citizen",
          },
        },
        reports: [{ ...canonicalReport, authorId: "legacy-citizen" }],
      }),
    )

    const projected = applyMunicipalSessionProjection(
      {
        id: "new-citizen",
        name: "Authenticated Citizen",
        role: "Citizen",
        phone: "+966500000020",
        avatarUrl: "/server.jpg",
        district: { id: "al-naeem", name: "Al-Naeem" },
      },
      storage,
    )

    expect(projected.activeProfileId).toBe("new-citizen")
    expect(Object.keys(projected.profilesByUserId)).toEqual(["legacy-citizen", "new-citizen"])
    expect(projected.profilesByUserId["legacy-citizen"].phone).toBe("+966500000010")
    expect(projected.reports[0].authorId).toBe("legacy-citizen")
    expect(getProfileForAuthenticatedUser(projected, "new-citizen")?.phone).toBe("+966500000020")
    expect(getProfileForAuthenticatedUser(projected, "unknown")).toBeNull()
    expect(getProfileForAuthenticatedUser(projected, "toString")).toBeNull()
  })

  it("preserves an exact-ID profile, server phone authority, and ownership after a local rename", () => {
    const storage = new MemoryStorage()
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...EMPTY_APP_STORAGE,
        profilesByUserId: {
          "demo-citizen": {
            id: "demo-citizen",
            name: "Existing Local Name",
            phone: "+966500000030",
            district: "Al-Naeem",
            avatar: "/local-avatar.jpg",
            role: "Citizen",
          },
        },
        reports: [{ ...canonicalReport, authorId: "demo-citizen" }],
      }),
    )

    const projected = applyMunicipalSessionProjection(
      {
        id: "demo-citizen",
        name: "Server Name",
        role: "Citizen",
        phone: "+966500000031",
        avatarUrl: "/server-avatar.jpg",
        district: { id: "al-balad", name: "Al-Balad" },
      },
      storage,
    )
    expect(projected.profilesByUserId["demo-citizen"]).toMatchObject({
      name: "Existing Local Name",
      phone: "+966500000031",
      district: "Al-Naeem",
      avatar: "/local-avatar.jpg",
    })

    const renamed = updateProfileForAuthenticatedUser(
      "demo-citizen",
      { name: "Renamed Locally" },
      storage,
    )
    expect(renamed.profilesByUserId["demo-citizen"].name).toBe("Renamed Locally")
    expect(renamed.reports[0].authorId).toBe("demo-citizen")
  })

  it.each(["Manager", "Crew"] as const)("does not select a Citizen profile for a %s session", (role) => {
    const storage = new MemoryStorage()
    const citizen = {
      id: "citizen-1",
      name: "Citizen",
      district: "Al-Naeem",
      avatar: "/citizen.jpg",
      role: "Citizen" as const,
    }
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...EMPTY_APP_STORAGE,
        role: "Citizen",
        profilesByUserId: { [citizen.id]: citizen },
        activeProfileId: citizen.id,
        reports: [canonicalReport],
      }),
    )

    const projected = applyMunicipalSessionProjection(
      {
        id: `${role.toLowerCase()}-1`,
        name: `${role} User`,
        role,
        phone: null,
        avatarUrl: null,
        district: null,
      },
      storage,
    )

    expect(projected.role).toBe(role)
    expect(projected.activeProfileId).toBeNull()
    expect(projected.profilesByUserId).toEqual({ [citizen.id]: citizen })
    expect(projected.reports).toEqual([canonicalReport])
  })
})
