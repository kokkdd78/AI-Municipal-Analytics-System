"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Home, MapIcon, Lightbulb, User, Layers } from "lucide-react"
import Link from "next/link"
import { useData } from "@/context/data-context"
import { getReportPhotoUrl } from "@/lib/report-utils"
import type { Report } from "@/types/domain"
import Image from "next/image"
import { handleStandaloneMapPinAction } from "@/lib/map-actions"
import AuthenticatedRoleBoundary from "@/components/authenticated-role-boundary"

const MapComponent = dynamic(() => import("../../components/map-component"), {
  ssr: false,
})

export default function MapPage() {
  return (
    <AuthenticatedRoleBoundary role="Citizen">
      <MapPageContent />
    </AuthenticatedRoleBoundary>
  )
}

function MapPageContent() {
  const { reports, suggestions, votedReports, votedSuggestions, upvoteSuggestion } = useData()
  const [activeTab, setActiveTab] = useState("map")
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [suggestionsVisible, setSuggestionsVisible] = useState(true)

  const selectedPhoto = selectedReport ? getReportPhotoUrl(selectedReport) : null

  return (
    <div className="h-screen bg-background flex flex-col relative">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 bg-card border-b border-border z-10">
        <h1 className="text-xl font-bold text-foreground">Issues Map</h1>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapComponent
          center={[21.5433, 39.1728]}
          reports={reports}
          suggestions={suggestions}
          suggestionsVisible={suggestionsVisible}
          votedReports={votedReports}
          votedSuggestions={votedSuggestions}
          onPinClick={(id, type) => {
            handleStandaloneMapPinAction(id, type, {
              selectReport: (reportId) => {
                setSelectedReport(reports.find((report) => report.id === reportId) ?? null)
              },
              upvoteSuggestion,
            })
          }}
        />

        {/* Layer Toggle */}
        <button
          onClick={() => setSuggestionsVisible(!suggestionsVisible)}
          className="absolute bottom-6 right-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full p-4 shadow-lg flex items-center justify-center active:scale-95 transition-transform z-20"
        >
          <Layers className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom Sheet */}
      {selectedReport && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl shadow-2xl z-50 pb-24 animate-in slide-in-from-bottom-full">
          <div className="p-6">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 bg-muted rounded-full"></div>
            </div>

            {selectedPhoto && (
              <Image
                src={selectedPhoto}
                alt="Issue Photo"
                width={800}
                height={320}
                unoptimized
                className="w-full h-40 object-cover rounded-lg mb-4"
              />
            )}

            <h2 className="text-xl font-bold text-foreground mb-2">{selectedReport.title}</h2>

            <p className="text-sm text-muted-foreground mb-1">{selectedReport.description}</p>

            <p className="text-xs text-muted-foreground mb-4">District: {selectedReport.district}</p>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              onClick={() => setSelectedReport(null)}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around">
        <Link href="/citizen-app" onClick={() => setActiveTab("home")}>
          <button
            className={`flex flex-col items-center justify-center w-20 h-20 ${activeTab === "home" ? "text-primary" : "text-muted-foreground"}`}
          >
            <Home className="h-6 w-6" />
            <span className="text-xs mt-1">Home</span>
          </button>
        </Link>

        <Link href="/map" onClick={() => setActiveTab("map")}>
          <button className="flex flex-col items-center justify-center w-20 h-20 text-primary">
            <MapIcon className="h-6 w-6" />
            <span className="text-xs mt-1">Map</span>
          </button>
        </Link>

        <Link href="/citizen-app" onClick={() => setActiveTab("suggestions")}>
          <button
            className={`flex flex-col items-center justify-center w-20 h-20 ${activeTab === "suggestions" ? "text-primary" : "text-muted-foreground"}`}
          >
            <Lightbulb className="h-6 w-6" />
            <span className="text-xs mt-1">Suggestions</span>
          </button>
        </Link>

        <Link href="/citizen-app" onClick={() => setActiveTab("profile")}>
          <button
            className={`flex flex-col items-center justify-center w-20 h-20 ${activeTab === "profile" ? "text-primary" : "text-muted-foreground"}`}
          >
            <User className="h-6 w-6" />
            <span className="text-xs mt-1">Profile</span>
          </button>
        </Link>
      </div>
    </div>
  )
}
