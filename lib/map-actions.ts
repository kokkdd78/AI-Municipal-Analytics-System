export type MapPinType = "report" | "suggestion"

interface StandaloneMapPinActions {
  selectReport: (id: string) => void
  upvoteSuggestion: (id: string) => void
}

export function handleStandaloneMapPinAction(
  id: string,
  type: MapPinType,
  actions: StandaloneMapPinActions,
): void {
  if (type === "report") {
    actions.selectReport(id)
    return
  }

  actions.upvoteSuggestion(id)
}
