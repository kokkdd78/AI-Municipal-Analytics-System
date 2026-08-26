import "server-only"

import { GoogleGenAI } from "@google/genai"

import type { AssistanceCandidate } from "./repository"
import { providerSuggestionSchema, type ReportAssistanceRequest } from "./contracts"

export interface ReportAssistanceProvider {
  suggest(input: {
    report: ReportAssistanceRequest
    candidates: AssistanceCandidate[]
  }): Promise<unknown>
}

function configuredGemini(): { apiKey: string; model: string } | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  const model = process.env.GEMINI_MODEL?.trim()
  return apiKey && model ? { apiKey, model } : null
}

function promptFor(report: ReportAssistanceRequest, candidates: AssistanceCandidate[]): string {
  return JSON.stringify({
    task: "Provide advisory municipal report classification only. Do not claim certainty. Choose one allowed category, one severity, a brief neutral reason, and zero to five duplicate candidate IDs only when they plausibly describe the same issue. Never use IDs not supplied.",
    allowedCategories: ["trash", "lighting", "pothole", "water", "trees", "other"],
    report: {
      description: report.description,
      districtId: report.districtId,
      location: report.location ?? null,
      locationText: report.locationText ?? null,
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      category: candidate.category,
      description: candidate.description.slice(0, 320),
      district: candidate.districtName,
      location: { lat: candidate.latitude, lng: candidate.longitude },
    })),
  })
}

const responseJsonSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["trash", "lighting", "pothole", "water", "trees", "other"] },
    severity: { type: "string", enum: ["low", "medium", "high"] },
    reasoning: { type: "string" },
    duplicateIds: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
  required: ["category", "severity", "reasoning", "duplicateIds"],
  additionalProperties: false,
} as const

export function createGeminiReportAssistanceProvider(): ReportAssistanceProvider | null {
  const configuration = configuredGemini()
  if (!configuration) return null

  const gemini = new GoogleGenAI({ apiKey: configuration.apiKey })
  return {
    async suggest({ report, candidates }) {
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
        { text: promptFor(report, candidates) },
      ]
      if (report.image) {
        parts.push({
          inlineData: {
            data: report.image.dataUrl.slice(report.image.dataUrl.indexOf(",") + 1),
            mimeType: report.image.mimeType,
          },
        })
      }
      const result = await gemini.models.generateContent({
        model: configuration.model,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema,
          temperature: 0,
        },
      })
      return providerSuggestionSchema.parse(JSON.parse(result.text ?? ""))
    },
  }
}
