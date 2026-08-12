import { describe, expect, it } from "vitest"

import {
  applySuggestionVote,
  EMPTY_APP_STORAGE,
  type AppStorageState,
} from "../lib/client-storage"
import { handleStandaloneMapPinAction } from "../lib/map-actions"

describe("standalone map actions", () => {
  it("persists one suggestion vote and preserves the existing report-pin action", () => {
    let selectedReportId: string | null = null
    let state: AppStorageState = {
      ...EMPTY_APP_STORAGE,
      suggestions: [
        {
          id: "suggestion-1",
          title: "New park",
          category: "park",
          location: { lat: 21.56, lng: 39.19 },
          description: "Add more green space",
          district: { id: "al-naeem", name: "Al-Naeem", arabic: "" },
          createdAt: "2026-08-11T08:00:00.000Z",
          votes: 2,
        },
      ],
    }
    const actions = {
      selectReport: (id: string) => {
        selectedReportId = id
      },
      upvoteSuggestion: (id: string) => {
        state = applySuggestionVote(state, id)
      },
    }

    handleStandaloneMapPinAction("suggestion-1", "suggestion", actions)
    handleStandaloneMapPinAction("suggestion-1", "suggestion", actions)

    expect(state.suggestions[0].votes).toBe(3)
    expect(state.votedSuggestionIds).toEqual(["suggestion-1"])
    expect(selectedReportId).toBeNull()

    handleStandaloneMapPinAction("report-1", "report", actions)

    expect(selectedReportId).toBe("report-1")
    expect(state.suggestions[0].votes).toBe(3)
  })
})
