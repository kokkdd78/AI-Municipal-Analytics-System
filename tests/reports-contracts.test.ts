import { describe, expect, it } from "vitest"

import {
  createReportRequestSchema,
  hasSupportedJsonMediaType,
  parseReportListQuery,
  reportVoteRequestSchema,
} from "../lib/reports/contracts"
import { reportTitleFromCategory } from "../lib/reports/category"

const validReport = {
  category: "pothole",
  description: "A deep pothole is blocking the right lane.",
  districtId: "al-naeem",
  location: { lat: 21.5433, lng: 39.1728 },
  severity: "high",
} as const

describe("Phase 3A1 report contracts", () => {
  it("accepts and trims the supported report creation fields", () => {
    const parsed = createReportRequestSchema.parse({
      ...validReport,
      category: "  pothole  ",
      description: "  A deep pothole is blocking the right lane.  ",
    })

    expect(parsed).toEqual(validReport)
  })

  it.each(["id", "authorId", "status", "votes", "createdAt", "updatedAt", "archiveDate", "attachments"])(
    "rejects the client-controlled %s field",
    (field) => {
      expect(createReportRequestSchema.safeParse({ ...validReport, [field]: "forged" }).success).toBe(false)
    },
  )

  it.each(["_", "___", "-", "---", "_-_ -__"])(
    "rejects the separator-only category %j before title derivation",
    (category) => {
      expect(createReportRequestSchema.safeParse({ ...validReport, category }).success).toBe(false)
      expect(reportTitleFromCategory(category)).toBe("")
    },
  )

  it.each([
    ["trash", "Trash"],
    ["lighting", "Lighting"],
    ["light", "Light"],
    ["pothole", "Pothole"],
    ["water", "Water"],
    ["trees", "Trees"],
    ["other", "Other"],
  ])("keeps the existing municipal category %s with title %s", (category, title) => {
    expect(createReportRequestSchema.safeParse({ ...validReport, category }).success).toBe(true)
    expect(reportTitleFromCategory(category)).toBe(title)
  })

  it.each([
    [{ ...validReport, category: " " }, "blank category"],
    [{ ...validReport, description: "\u0000hidden" }, "control characters"],
    [{ ...validReport, severity: "critical" }, "unsupported severity"],
    [{ ...validReport, location: { lat: 91, lng: 39.2 } }, "invalid latitude"],
    [{ ...validReport, location: { lat: 21.5, lng: 181 } }, "invalid longitude"],
    [{ ...validReport, location: { lat: Number.NaN, lng: 39.2 } }, "non-finite coordinates"],
    [{ ...validReport, location: { lat: 21.5, lng: 39.2, label: "forged" } }, "unknown location fields"],
    [{ ...validReport, districtId: "../district" }, "malformed district identifiers"],
  ])("rejects %s", (payload, reason) => {
    expect(createReportRequestSchema.safeParse(payload).success, reason).toBe(false)
  })

  it("preserves ordinary multiline descriptions", () => {
    expect(
      createReportRequestSchema.parse({ ...validReport, description: "First line\nSecond line" }).description,
    ).toBe("First line\nSecond line")
  })

  it("accepts only an empty vote body", () => {
    expect(reportVoteRequestSchema.safeParse({}).success).toBe(true)
    expect(reportVoteRequestSchema.safeParse({ userId: "other", votes: 99 }).success).toBe(false)
  })

  it("strictly validates bounded cursor pagination", () => {
    expect(parseReportListQuery(new URLSearchParams("scope=mine"))).toEqual({
      scope: "mine",
      limit: 20,
    })
    expect(parseReportListQuery(new URLSearchParams("scope=community&cursor=report-1&limit=50"))).toEqual({
      scope: "community",
      cursor: "report-1",
      limit: 50,
    })

    for (const query of [
      "",
      "scope=all",
      "scope=mine&scope=community",
      "scope=mine&unknown=value",
      "scope=mine&limit=0",
      "scope=mine&limit=51",
      "scope=mine&limit=1.5",
      "scope=mine&cursor=../report",
    ]) {
      expect(parseReportListQuery(new URLSearchParams(query)), query).toBeNull()
    }
  })

  it("accepts only unambiguous UTF-8 JSON media types", () => {
    expect(hasSupportedJsonMediaType("application/json")).toBe(true)
    expect(hasSupportedJsonMediaType("Application/JSON; Charset=UTF-8")).toBe(true)
    expect(hasSupportedJsonMediaType('application/json; charset="utf-8"')).toBe(true)

    for (const contentType of [
      null,
      "text/plain",
      "application/problem+json",
      "application/json, text/plain",
      "application/json; charset=iso-8859-1",
      "application/json; charset=utf-8; version=1",
    ]) {
      expect(hasSupportedJsonMediaType(contentType), String(contentType)).toBe(false)
    }
  })
})
