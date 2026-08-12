"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, ThumbsUp, MapPin, X, ChevronLeft } from "lucide-react"
import { useState } from "react"
import NewSuggestionProposal from "./new-suggestion-proposal"
import { useUserLocation } from "@/context/location-context"
import { useData } from "@/context/data-context"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { JEDDAH_DISTRICTS, type District, findDistrictByName } from "@/constants/districts"
import dynamic from "next/dynamic"

const MapComponent = dynamic(() => import("./map-component"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})

export default function SuggestionsScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { district } = useUserLocation()
  const { suggestions, upvoteSuggestion, votedSuggestions } = useData()
  const [isNewProposalOpen, setIsNewProposalOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<any>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<District>(
    findDistrictByName(district || "") || JEDDAH_DISTRICTS[0],
  )

  const handleUpvote = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    upvoteSuggestion(id)
  }

  const filteredSuggestions = suggestions.filter((s) => s.district.id === selectedDistrict.id)

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <div className="px-6 py-6 bg-background border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="-ml-2" onClick={() => onNavigate("home")}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <h2 className="text-2xl font-bold text-foreground">Community Suggestions</h2>
          </div>
          <Button
            size="icon"
            className="rounded-full shadow-lg bg-primary hover:bg-primary/90 text-white"
            onClick={() => setIsNewProposalOpen(true)}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Filter by district</p>
          <Select
            value={selectedDistrict.id}
            onValueChange={(id) => {
              const dist = JEDDAH_DISTRICTS.find((d) => d.id === id)
              if (dist) setSelectedDistrict(dist)
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Select district" />
            </SelectTrigger>
            <SelectContent>
              {JEDDAH_DISTRICTS.map((dist) => (
                <SelectItem key={dist.id} value={dist.id}>
                  {dist.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredSuggestions.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <p>No suggestions for {selectedDistrict.name}.</p>
            <p className="text-sm">Be the first to propose an improvement!</p>
          </div>
        ) : (
          filteredSuggestions.map((suggestion) => (
            <Card
              key={suggestion.id}
              className="p-4 transition-all hover:border-primary/50 cursor-pointer"
              onClick={() => setSelectedSuggestion(suggestion)}
            >
              <div className="flex justify-between items-center">
                <div className="flex-1 pr-4">
                  <h3 className="font-semibold text-foreground mb-1">{suggestion.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{suggestion.description}</p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mr-1" />
                    {suggestion.district.name}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Button
                    variant={votedSuggestions.has(suggestion.id) ? "default" : "outline"}
                    size="sm"
                    className={`h-14 w-10 flex flex-col gap-1 p-0 ${
                      votedSuggestions.has(suggestion.id) ? "bg-primary text-white" : ""
                    }`}
                    onClick={(e) => handleUpvote(e, suggestion.id)}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    <span className="text-xs font-bold">{suggestion.votes}</span>
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <NewSuggestionProposal
        open={isNewProposalOpen}
        onOpenChange={setIsNewProposalOpen}
        district={selectedDistrict.name}
      />

      {/* Suggestion Details Modal */}
      <Dialog open={!!selectedSuggestion} onOpenChange={(open) => !open && setSelectedSuggestion(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden h-[60vh] flex flex-col">
          {selectedSuggestion && (
            <>
              <div className="relative h-1/2">
                <MapComponent
                  center={{ lat: selectedSuggestion.lat, lng: selectedSuggestion.lng }}
                  zoom={15}
                  suggestions={[selectedSuggestion]}
                  suggestionsVisible={true}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-4 right-4 z-[1000] rounded-full shadow-lg"
                  onClick={() => setSelectedSuggestion(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-6 flex-1 overflow-y-auto bg-background">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {selectedSuggestion.category}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(selectedSuggestion.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="text-xl font-bold mb-2">{selectedSuggestion.title}</h2>
                <p className="text-muted-foreground mb-4">{selectedSuggestion.description}</p>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mr-1" />
                    {selectedSuggestion.district.name}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{selectedSuggestion.votes} votes</span>
                    <Button
                      variant={votedSuggestions.has(selectedSuggestion.id) ? "default" : "outline"}
                      size="sm"
                      onClick={(e) => handleUpvote(e, selectedSuggestion.id)}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Vote
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
