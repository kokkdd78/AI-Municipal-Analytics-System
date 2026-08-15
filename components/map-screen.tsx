"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useData } from "@/context/data-context"
import { useUserLocation } from "@/context/location-context"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

const MapComponent = dynamic(() => import("./map-component"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse flex items-center justify-center">Loading Map...</div>,
})

export default function MapScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const {
    reports,
    upvoteReport,
    votedReports,
    votingReportIds,
    reportLoadState,
    reportMutationError,
    refreshReports,
    suggestions,
    upvoteSuggestion,
    votedSuggestions,
    votingSuggestionIds,
    suggestionLoadState,
    suggestionMutationError,
    refreshSuggestions,
  } = useData()
  const { location } = useUserLocation()
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)

  const handlePinClick = (id: string, type: "report" | "suggestion") => {
    if (type === "report") {
      void upvoteReport(id)
    } else {
      void upvoteSuggestion(id)
    }
  }

  return (
    <div className="h-full w-full relative">
      <MapComponent
        center={location || { lat: 21.5433, lng: 39.1728 }}
        reports={reports}
        suggestions={suggestions}
        suggestionsVisible={suggestionsVisible}
        onPinClick={handlePinClick}
        votedReports={votedReports}
        pendingReports={votingReportIds}
        votedSuggestions={votedSuggestions}
        pendingSuggestions={votingSuggestionIds}
      />

      {(reportLoadState.isLoading || reportLoadState.error || reportMutationError || suggestionLoadState.error || suggestionMutationError) && (
        <div className="absolute top-20 left-4 right-4 z-[1000] rounded-lg border bg-background/95 p-3 shadow-lg">
          {reportLoadState.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading community reports…</p>
          ) : (
            <>
              <p className="text-sm text-destructive">
                {reportLoadState.error ?? reportMutationError ?? suggestionLoadState.error ?? suggestionMutationError}
              </p>
              {reportLoadState.error && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => void refreshReports()}>Retry</Button>
              )}
              {!reportLoadState.error && suggestionLoadState.error && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => void refreshSuggestions()}>Retry</Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-4 left-4 z-[1000]">
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full shadow-lg bg-background/90 backdrop-blur-sm"
          onClick={() => onNavigate("home")}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      </div>

      <div className="absolute top-4 right-4 z-[1000] bg-background/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-border">
        <div className="flex items-center space-x-2">
          <Switch
            id="show-suggestions"
            checked={suggestionsVisible}
            onCheckedChange={setSuggestionsVisible}
          />
          <Label htmlFor="show-suggestions" className="text-sm font-medium">
            Show Suggestions
          </Label>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-background/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-border">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs">Reports</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-xs">Suggestions</span>
          </div>
        </div>
      </div>
    </div>
  )
}
