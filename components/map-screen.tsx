"use client"

import { useState, useEffect } from "react"
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
  const { reports, upvoteReport, votedReports, suggestions, upvoteSuggestion, votedSuggestions } = useData()
  const { location } = useUserLocation()
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handlePinClick = (id: string, type: "report" | "suggestion") => {
    if (type === "report") {
      upvoteReport(id)
    } else {
      upvoteSuggestion(id)
    }
  }

  if (!isMounted) return <div className="h-full w-full bg-background" />

  return (
    <div className="h-full w-full relative">
      <MapComponent
        center={location || { lat: 21.5433, lng: 39.1728 }}
        reports={reports}
        suggestions={suggestions}
        suggestionsVisible={suggestionsVisible}
        onPinClick={handlePinClick}
        votedReports={votedReports}
        votedSuggestions={votedSuggestions}
      />

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
