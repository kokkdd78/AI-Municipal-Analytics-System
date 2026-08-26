import { z } from "zod"

import { REPORT_SEVERITIES } from "../../types/domain"

export const REPORT_ASSISTANCE_CATEGORIES = ["trash", "lighting", "pothole", "water", "trees", "other"] as const
export const MAX_ASSISTANCE_IMAGE_BYTES = 1_000_000

const identifier = z.string().trim().min(1).max(191).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const text = (maximum: number) => z.string().trim().min(1).max(maximum)
const assistanceImageMimeType = z.enum(["image/jpeg", "image/png", "image/webp"])

function decodedBase64Length(value: string): number | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return null
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0
  return (value.length / 4) * 3 - padding
}

function hasExpectedImageSignature(mimeType: string, base64: string): boolean {
  if (mimeType === "image/jpeg") return base64.startsWith("/9j/")
  if (mimeType === "image/png") return base64.startsWith("iVBORw0KGgo")
  return base64.startsWith("UklGR") && base64.slice(8, 16).startsWith("V0VCUA")
}

export const assistanceImageSchema = z.object({
  mimeType: assistanceImageMimeType,
  dataUrl: z.string().max(Math.ceil(MAX_ASSISTANCE_IMAGE_BYTES * 1.34) + 128),
}).strict().superRefine((image, context) => {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(image.dataUrl)
  if (!match || match[1].toLowerCase() !== image.mimeType) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid image" })
    return
  }
  const bytes = decodedBase64Length(match[2])
  if (
    bytes === null || bytes <= 0 || bytes > MAX_ASSISTANCE_IMAGE_BYTES
    || !hasExpectedImageSignature(image.mimeType, match[2])
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid image" })
  }
})

export const reportAssistanceRequestSchema = z.object({
  description: text(2_000),
  districtId: identifier,
  location: z.object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  }).strict(),
  locationText: text(240).optional(),
  image: assistanceImageSchema.optional(),
}).strict()

export const providerSuggestionSchema = z.object({
  category: z.enum(REPORT_ASSISTANCE_CATEGORIES),
  severity: z.enum(REPORT_SEVERITIES),
  reasoning: text(400),
  duplicateIds: z.array(identifier).max(5),
}).strict()

const duplicateSuggestionSchema = z.object({
  id: identifier,
  title: text(120),
  summary: text(320),
}).strict()

export const availableReportAssistanceSchema = z.object({
  available: z.literal(true),
  suggestion: z.object({
    category: z.enum(REPORT_ASSISTANCE_CATEGORIES),
    severity: z.enum(REPORT_SEVERITIES),
    reasoning: text(400),
  }).strict(),
  possibleDuplicates: z.array(duplicateSuggestionSchema).max(5),
}).strict()

export const unavailableReportAssistanceSchema = z.object({ available: z.literal(false) }).strict()
export const reportAssistanceResponseSchema = z.union([
  availableReportAssistanceSchema,
  unavailableReportAssistanceSchema,
])

export type ReportAssistanceRequest = z.infer<typeof reportAssistanceRequestSchema>
export type ProviderSuggestion = z.infer<typeof providerSuggestionSchema>
export type ReportAssistanceResponse = z.infer<typeof reportAssistanceResponseSchema>
