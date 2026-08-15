import { z } from "zod"

import type { CreateSuggestionRequest } from "./contracts"
import type { SuggestionDto } from "./dto"
import type { SuggestionVoteDto } from "./service"

const identifier = z.string().min(1).max(191).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const isoDate = z.string().datetime()
const suggestionDtoSchema: z.ZodType<SuggestionDto> = z.object({
  id: identifier,
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2_000),
  category: z.string().min(1).max(80),
  status: z.enum(["Under Review", "Approved", "Rejected"]),
  location: z.object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  }).strict(),
  district: z.object({ id: identifier, name: z.string().min(1).max(191) }).strict(),
  createdAt: isoDate,
  updatedAt: isoDate,
  votes: z.number().int().nonnegative(),
  hasVoted: z.boolean(),
}).strict()

const suggestionListSchema = z.object({ suggestions: z.array(suggestionDtoSchema) }).strict()
const suggestionVoteSchema: z.ZodType<SuggestionVoteDto> = z.object({
  suggestionId: identifier,
  voted: z.literal(true),
  votes: z.number().int().nonnegative(),
}).strict()

export type SuggestionClientErrorKind =
  | "aborted"
  | "authentication"
  | "conflict"
  | "forbidden"
  | "malformed-response"
  | "network"
  | "not-found"
  | "rate-limit"
  | "server"
  | "validation"

export class SuggestionClientError extends Error {
  constructor(readonly kind: SuggestionClientErrorKind, readonly status: number | null) {
    super("The suggestion request could not be completed")
    this.name = "SuggestionClientError"
  }
}

export interface SuggestionRequestOptions {
  signal?: AbortSignal
}

const SAFE_MESSAGES: Record<Exclude<SuggestionClientErrorKind, "aborted">, string> = {
  authentication: "Your session has expired. Please sign in again.",
  conflict: "That suggestion operation is already complete.",
  forbidden: "You are not authorized to complete that suggestion operation.",
  "malformed-response": "The suggestion service returned an unexpected response.",
  network: "Unable to reach the suggestion service. Check your connection and try again.",
  "not-found": "The requested suggestion could not be found.",
  "rate-limit": "Too many suggestion requests. Please wait and try again.",
  server: "The suggestion service is temporarily unavailable. Please try again.",
  validation: "Please check the suggestion information and try again.",
}

export function suggestionClientErrorMessage(error: unknown): string {
  if (!(error instanceof SuggestionClientError) || error.kind === "aborted") return SAFE_MESSAGES.server
  return SAFE_MESSAGES[error.kind]
}

function responseError(status: number): SuggestionClientError {
  if (status === 400) return new SuggestionClientError("validation", status)
  if (status === 401) return new SuggestionClientError("authentication", status)
  if (status === 403) return new SuggestionClientError("forbidden", status)
  if (status === 404) return new SuggestionClientError("not-found", status)
  if (status === 409) return new SuggestionClientError("conflict", status)
  if (status === 429) return new SuggestionClientError("rate-limit", status)
  return new SuggestionClientError("server", status)
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", ...init.headers },
    })
    if (!response.ok) throw responseError(response.status)
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new SuggestionClientError("malformed-response", response.status)
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new SuggestionClientError("malformed-response", response.status)
    return parsed.data
  } catch (error) {
    if (init.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new SuggestionClientError("aborted", null)
    }
    throw error instanceof SuggestionClientError ? error : new SuggestionClientError("network", null)
  }
}

export async function listSuggestions(options: SuggestionRequestOptions = {}): Promise<SuggestionDto[]> {
  return (await requestJson("/api/suggestions", suggestionListSchema, {
    method: "GET",
    signal: options.signal,
  })).suggestions
}

export function createSuggestion(
  input: CreateSuggestionRequest,
  options: SuggestionRequestOptions = {},
): Promise<SuggestionDto> {
  return requestJson("/api/suggestions", suggestionDtoSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: options.signal,
  })
}

export function voteForSuggestion(
  id: string,
  options: SuggestionRequestOptions = {},
): Promise<SuggestionVoteDto> {
  return requestJson(`/api/suggestions/${encodeURIComponent(id)}/vote`, suggestionVoteSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: options.signal,
  })
}
