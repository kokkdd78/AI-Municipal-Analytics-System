import { z } from "zod"

const identifier = z.string().trim().min(1).max(191).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const boundedText = (maximum: number) => z
  .string()
  .trim()
  .min(1)
  .max(maximum)
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))

export const suggestionIdSchema = identifier
export const createSuggestionRequestSchema = z
  .object({
    title: boundedText(120),
    category: boundedText(80).refine((value) => !/[\r\n\t]/.test(value)),
    description: boundedText(2_000),
    districtId: identifier,
    location: z.object({
      lat: z.number().finite().min(-90).max(90),
      lng: z.number().finite().min(-180).max(180),
    }).strict(),
  })
  .strict()

export const suggestionVoteRequestSchema = z.object({}).strict()

export type CreateSuggestionRequest = z.infer<typeof createSuggestionRequestSchema>
