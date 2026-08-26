import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import type { AuthenticatedMunicipalUser } from "../lib/auth/authorization-core"
import { applyAssistanceSuggestion, overrideAssistanceSuggestion } from "../lib/report-assistance/draft"
import { createGeminiReportAssistanceProvider } from "../lib/report-assistance/provider"
import type { ReportAssistanceRepository } from "../lib/report-assistance/repository"
import { createReportAssistanceService } from "../lib/report-assistance/service"
import { submitReportWithOptionalImage } from "../lib/reports/form-operation"

const citizen: AuthenticatedMunicipalUser = { id: "citizen-1", name: "Citizen", role: "Citizen", isActive: true, avatarUrl: null, districtId: "al-naeem", departmentId: null }
const request = { description: "A large pothole blocks the lane.", districtId: "al-naeem", location: { lat: 21.5, lng: 39.2 } }
const candidates = [{ id: "report-1", title: "Lane pothole", category: "pothole", description: "Pothole near the intersection", districtName: "Al-Naeem", latitude: 21.5, longitude: 39.2 }]

function repository(): ReportAssistanceRepository {
  return { districtExists: vi.fn().mockResolvedValue(true), recentCandidates: vi.fn().mockResolvedValue(candidates) }
}

describe("report assistance service", () => {
  const priorKey = process.env.GEMINI_API_KEY
  const priorModel = process.env.GEMINI_MODEL
  afterEach(() => { if (priorKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = priorKey; if (priorModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = priorModel })

  it("returns validated configured suggestions without creating a report", async () => {
    const repo = repository()
    const provider = { suggest: vi.fn().mockResolvedValue({ category: "pothole", severity: "high", reasoning: "The description identifies a road hazard.", duplicateIds: ["report-1", "unknown"] }) }
    const service = createReportAssistanceService(repo, provider)
    const result = await service.assist(citizen, request)
    expect(result).toEqual({ available: true, suggestion: { category: "pothole", severity: "high", reasoning: "The description identifies a road hazard." }, possibleDuplicates: [{ id: "report-1", title: "Lane pothole", summary: "Pothole near the intersection" }] })
    expect(repo.recentCandidates).toHaveBeenCalledWith("al-naeem", 20)
    expect(provider.suggest).toHaveBeenCalledOnce()
    expect("createReport" in repo).toBe(false)
  })

  it("uses a safe unavailable result when Gemini configuration is missing", async () => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_MODEL
    expect(createGeminiReportAssistanceProvider()).toBeNull()
    await expect(createReportAssistanceService(repository(), null).assist(citizen, request)).resolves.toEqual({ available: false })
  })

  it("falls back when a provider fails or returns malformed output", async () => {
    await expect(createReportAssistanceService(repository(), { suggest: vi.fn().mockRejectedValue(new Error("provider unavailable")) }).assist(citizen, request)).resolves.toEqual({ available: false })
    await expect(createReportAssistanceService(repository(), { suggest: vi.fn().mockResolvedValue({ category: "invented", severity: "urgent" }) }).assist(citizen, request)).resolves.toEqual({ available: false })
  })

  it("keeps AI suggestions advisory so a citizen can override them before using the existing report API", async () => {
    const suggested = applyAssistanceSuggestion({ category: "other", severity: "medium" }, { available: true, suggestion: { category: "pothole", severity: "high", reasoning: "Road hazard" }, possibleDuplicates: [] })
    const overridden = overrideAssistanceSuggestion(suggested, { category: "water", severity: "low" })
    expect(overridden).toEqual({ category: "water", severity: "low" })
    const createReport = vi.fn().mockResolvedValue({ id: "created-by-existing-api" })
    await expect(submitReportWithOptionalImage({ existingReportId: null, report: { ...request, ...overridden }, image: null, signal: new AbortController().signal, createReport, uploadImage: vi.fn() })).resolves.toEqual({ reportId: "created-by-existing-api", image: "none" })
    expect(createReport).toHaveBeenCalledWith({ ...request, ...overridden }, expect.any(AbortSignal))
  })
})
