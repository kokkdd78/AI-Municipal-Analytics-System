import { describe, expect, it } from "vitest"

import {
  JEDDAH_DISTRICTS,
  findDistrictByName,
  findDistrictFromNominatimAddress,
  normalizeDistrictName,
} from "../constants/districts"
import {
  confirmedMapReportLocation,
  confirmedNominatimMapReportLocation,
} from "../lib/reports/form-operation"
import { reportAssistanceRequestSchema } from "../lib/report-assistance/contracts"
import { createReportRequestSchema } from "../lib/reports/contracts"

describe("canonical Jeddah district resolution", () => {
  it("covers every configured district by canonical ID, English name, and normalized English formatting", () => {
    expect(JEDDAH_DISTRICTS).toHaveLength(102)
    for (const district of JEDDAH_DISTRICTS) {
      expect(findDistrictByName(district.id)?.id).toBe(district.id)
      expect(findDistrictByName(district.name)?.id).toBe(district.id)
      expect(findDistrictByName(district.name.toUpperCase().replaceAll("-", " "))?.id).toBe(district.id)
    }
  })

  it("resolves every unambiguous configured Arabic name and rejects duplicate Arabic labels", () => {
    const districtsByArabic = new Map<string, typeof JEDDAH_DISTRICTS>()
    for (const district of JEDDAH_DISTRICTS) {
      const group = districtsByArabic.get(district.arabic) ?? []
      group.push(district)
      districtsByArabic.set(district.arabic, group)
    }

    for (const [arabicName, districts] of districtsByArabic) {
      if (districts.length === 1) {
        expect(findDistrictByName(arabicName)?.id).toBe(districts[0]?.id)
      } else {
        expect(findDistrictByName(arabicName)).toBeUndefined()
      }
    }
  })

  it.each([
    ["Al-Andalus", "al-andalus"],
    ["Al Andalus", "al-andalus"],
    ["AL  ANDALUS", "al-andalus"],
    ["الأندلس", "al-andalus"],
    ["حي الأندلس", "al-andalus"],
    ["As Salamah", "al-salamah"],
    ["Ar Rawdah", "al-rawdah"],
    ["Ash Shati", "al-shati"],
    ["Umm Al Salam", "umm-as-salam"],
    ["Al Marwa", "al-marwah"],
    ["El-Marwah", "al-marwah"],
    ["المروه", "al-marwah"],
    ["مروة", "al-marwah"],
  ])("resolves %s to configured district %s", (value, expectedId) => {
    expect(findDistrictByName(value)?.id).toBe(expectedId)
  })

  it("normalizes capitalization, separators, and article variants consistently", () => {
    expect(normalizeDistrictName("Al-Andalus")).toBe(normalizeDistrictName("al andalus"))
    expect(normalizeDistrictName("Ash-Shati")).toBe(normalizeDistrictName("Al Shati"))
  })

  it("checks all supported Nominatim district fields in a safe order", () => {
    expect(findDistrictFromNominatimAddress({ neighbourhood: "Al Andalus" })?.id).toBe("al-andalus")
    expect(findDistrictFromNominatimAddress({ suburb: "النعيم" })?.id).toBe("al-naeem")
    expect(findDistrictFromNominatimAddress({ quarter: "Al Hamra" })?.id).toBe("al-hamra")
    expect(findDistrictFromNominatimAddress({ residential: "Al Zahra" })?.id).toBe("al-zahra")
    expect(findDistrictFromNominatimAddress({ city_district: "Al Safa" })?.id).toBe("al-safa")
  })

  it("rejects unmappable and ambiguous values without a profile fallback", () => {
    expect(findDistrictFromNominatimAddress({ neighbourhood: "Unknown Location", city_district: "Jeddah" })).toBeUndefined()
    expect(findDistrictByName("المرجان")).toBeUndefined()
    expect(confirmedMapReportLocation(21.5433, 39.1728, "Unknown Location")).toBeNull()
  })

  it("returns coordinates and the canonical district atomically", () => {
    expect(confirmedMapReportLocation(21.5433, 39.1728, "Al-Andalus", "al-andalus")).toEqual({
      lat: 21.5433,
      lng: 39.1728,
      districtId: "al-andalus",
      districtName: "Al-Andalus",
      source: "map",
    })
    expect(confirmedMapReportLocation(21.5433, 39.1728, "Al-Hamra", "al-andalus")).toBeNull()
  })

  it("resolves the live Al-Marwah Nominatim case to the new canonical reference", () => {
    const district = findDistrictFromNominatimAddress({ neighbourhood: "المروة" })
    expect(district).toEqual({ id: "al-marwah", name: "Al-Marwah", arabic: "المروة" })
    expect(confirmedMapReportLocation(21.6113323, 39.1964940, district!.name, district!.id)).toEqual({
      lat: 21.6113323,
      lng: 39.196494,
      districtId: "al-marwah",
      districtName: "Al-Marwah",
      source: "map",
    })
    expect(confirmedNominatimMapReportLocation(21.6113323, 39.1964940, {
      neighbourhood: "المروة",
      suburb: null,
      quarter: null,
      residential: null,
      city_district: null,
    })).toEqual({
      lat: 21.6113323,
      lng: 39.196494,
      districtId: "al-marwah",
      districtName: "Al-Marwah",
      source: "map",
    })

    const location = { lat: 21.6113323, lng: 39.196494 }
    expect(createReportRequestSchema.safeParse({
      category: "pothole",
      description: "Road damage in Al-Marwah",
      districtId: district!.id,
      location,
    }).success).toBe(true)
    expect(reportAssistanceRequestSchema.safeParse({
      description: "Road damage in Al-Marwah",
      districtId: district!.id,
      location,
      locationText: district!.name,
    }).success).toBe(true)
  })
})
