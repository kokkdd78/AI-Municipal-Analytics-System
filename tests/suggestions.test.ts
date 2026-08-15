import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedMunicipalUser } from "../lib/auth/authorization-core"
import { EMPTY_APP_STORAGE } from "../lib/client-storage"
import type { ReportHttpAuthorization } from "../lib/reports/http"
import {
  applyLegacySuggestionVote,
  legacySuggestionViews,
  mayDisplayServerSuggestions,
  mergeCitizenSuggestionViews,
  mergeSuggestionVote,
  serverSuggestionToView,
} from "../lib/suggestions/client-state"
import {
  createSuggestion,
  listSuggestions,
  SuggestionClientError,
  voteForSuggestion,
} from "../lib/suggestions/client"
import { createSuggestionRequestSchema } from "../lib/suggestions/contracts"
import { createSuggestionHttpHandlers } from "../lib/suggestions/http"
import type { SuggestionService } from "../lib/suggestions/service"

const ORIGIN = "https://municipal.example.test"
const citizen: AuthenticatedMunicipalUser = {
  id: "citizen-1",
  name: "Citizen",
  role: "Citizen",
  isActive: true,
  avatarUrl: null,
  districtId: "al-naeem",
  departmentId: null,
}
const suggestion = {
  id: "suggestion-1",
  title: "New Park",
  description: "A small community park would add shade.",
  category: "park",
  status: "Under Review" as const,
  location: { lat: 21.55, lng: 39.18 },
  district: { id: "al-naeem", name: "Al-Naeem" },
  createdAt: "2026-08-16T10:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
  votes: 0,
  hasVoted: false,
}

afterEach(() => vi.unstubAllGlobals())

describe("Phase 3B typed suggestion client", () => {
  it("uses same-origin cookies, no-store, and never forges Origin", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ suggestions: [suggestion] }))
      .mockResolvedValueOnce(Response.json(suggestion, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ suggestionId: suggestion.id, voted: true, votes: 1 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listSuggestions()).resolves.toEqual([suggestion])
    await expect(createSuggestion({
      title: suggestion.title,
      category: suggestion.category,
      description: suggestion.description,
      districtId: suggestion.district.id,
      location: suggestion.location,
    })).resolves.toEqual(suggestion)
    await expect(voteForSuggestion(suggestion.id)).resolves.toEqual({
      suggestionId: suggestion.id,
      voted: true,
      votes: 1,
    })
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe("same-origin")
      expect(init?.cache).toBe("no-store")
      expect(new Headers(init?.headers).has("origin")).toBe(false)
    }
  })

  it("rejects malformed and unsafe server responses with neutral errors", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ suggestions: [{ ...suggestion, hasVoted: "yes" }] }))
      .mockResolvedValueOnce(Response.json({ private: "account state" }, { status: 403 })))
    await expect(listSuggestions()).rejects.toMatchObject({
      name: "SuggestionClientError",
      kind: "malformed-response",
    })
    await expect(voteForSuggestion(suggestion.id)).rejects.toEqual(expect.any(SuggestionClientError))
  })
})

function request(path: string, options: { method?: string; body?: unknown; origin?: string | null } = {}) {
  const headers = new Headers()
  if (options.body !== undefined) headers.set("content-type", "application/json")
  if (options.origin !== null && (options.method === "POST" || options.origin !== undefined)) {
    headers.set("origin", options.origin ?? ORIGIN)
  }
  return new Request(`${ORIGIN}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

describe("Phase 3B suggestion contracts and HTTP boundary", () => {
  const service = {
    list: vi.fn(),
    create: vi.fn(),
    vote: vi.fn(),
  }
  const authorization: ReportHttpAuthorization = {
    requireRole: vi.fn(),
    requireAnyRole: vi.fn(),
  }
  const handlers = createSuggestionHttpHandlers({
    authorization,
    service: service as unknown as SuggestionService,
    trustedOrigins: [ORIGIN],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authorization.requireRole).mockResolvedValue({ user: citizen })
    vi.mocked(authorization.requireAnyRole).mockResolvedValue({ user: citizen })
    service.list.mockResolvedValue([suggestion])
    service.create.mockResolvedValue(suggestion)
    service.vote.mockResolvedValue({ suggestionId: suggestion.id, voted: true, votes: 1 })
  })

  it("accepts only the existing strict suggestion fields", () => {
    const valid = {
      title: "New Park",
      category: "park",
      description: "A small community park would add shade.",
      districtId: "al-naeem",
      location: { lat: 21.55, lng: 39.18 },
    }
    expect(createSuggestionRequestSchema.safeParse(valid).success).toBe(true)
    for (const privileged of ["id", "authorId", "status", "votes", "hasVoted", "createdAt"]) {
      expect(createSuggestionRequestSchema.safeParse({ ...valid, [privileged]: "forged" }).success).toBe(false)
    }
  })

  it("protects mutations by origin and live Citizen authorization", async () => {
    const body = {
      title: "New Park",
      category: "park",
      description: "A small community park would add shade.",
      districtId: "al-naeem",
      location: { lat: 21.55, lng: 39.18 },
    }
    const rejected = await handlers.collectionPOST(request("/api/suggestions", {
      method: "POST",
      origin: "https://evil.test",
      body,
    }))
    expect(rejected.status).toBe(403)
    expect(authorization.requireRole).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()

    vi.mocked(authorization.requireRole).mockResolvedValueOnce({
      response: Response.json({ error: "Access denied" }, { status: 403 }),
    })
    const staff = await handlers.votePOST(
      request(`/api/suggestions/${suggestion.id}/vote`, { method: "POST", body: {} }),
      { params: Promise.resolve({ id: suggestion.id }) },
    )
    expect(staff.status).toBe(403)
    expect(service.vote).not.toHaveBeenCalled()
  })

  it("creates, lists, and votes through safe personalized DTOs", async () => {
    const input = {
      title: "New Park",
      category: "park",
      description: "A small community park would add shade.",
      districtId: "al-naeem",
      location: { lat: 21.55, lng: 39.18 },
    }
    const created = await handlers.collectionPOST(request("/api/suggestions", { method: "POST", body: input }))
    const listed = await handlers.collectionGET(request("/api/suggestions"))
    const voted = await handlers.votePOST(
      request(`/api/suggestions/${suggestion.id}/vote`, { method: "POST", body: {} }),
      { params: Promise.resolve({ id: suggestion.id }) },
    )
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toEqual(suggestion)
    await expect(listed.json()).resolves.toEqual({ suggestions: [suggestion] })
    await expect(voted.json()).resolves.toEqual({ suggestionId: suggestion.id, voted: true, votes: 1 })
    expect(service.create).toHaveBeenCalledWith(citizen, input)
  })
})

describe("Phase 3B server and legacy suggestion state", () => {
  const legacy = {
    id: "suggestion-1",
    title: "Legacy Park",
    category: "park",
    description: "Stored on this device.",
    location: { lat: 21.5, lng: 39.2 },
    district: { id: "al-naeem", name: "Al-Naeem", arabic: "النعيم" },
    createdAt: "2026-08-15T10:00:00.000Z",
    votes: 4,
  }

  it("preserves legacy storage while server records win exact-ID duplicates", () => {
    const legacyViews = legacySuggestionViews([legacy], [legacy.id])
    const serverView = serverSuggestionToView(suggestion)
    expect(mergeCitizenSuggestionViews([serverView], legacyViews)).toEqual([serverView])
    expect(legacy).toMatchObject({ title: "Legacy Park", votes: 4 })
  })

  it("keeps legacy votes local and server votes out of localStorage state", () => {
    const state = { ...EMPTY_APP_STORAGE, suggestions: [legacy] }
    const voted = applyLegacySuggestionVote(state, legacy.id)
    expect(voted.suggestions[0]?.votes).toBe(5)
    expect(voted.votedSuggestionIds).toEqual([legacy.id])

    const serverOnly = mergeSuggestionVote([suggestion], suggestion.id, 1)
    expect(serverOnly[0]).toMatchObject({ votes: 1, hasVoted: true })
    expect(state.suggestions).toEqual([legacy])
    expect(state.votedSuggestionIds).toEqual([])
  })

  it("hides personalized server state immediately on account switching or logout", () => {
    expect(mayDisplayServerSuggestions("citizen-1", { id: "citizen-1", role: "Citizen" })).toBe(true)
    expect(mayDisplayServerSuggestions("citizen-1", { id: "citizen-2", role: "Citizen" })).toBe(false)
    expect(mayDisplayServerSuggestions("citizen-1", null)).toBe(false)
    expect(mayDisplayServerSuggestions("citizen-1", { id: "manager-1", role: "Manager" })).toBe(false)
  })
})
