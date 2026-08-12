"use client"

import { useState } from "react"

import HomeScreen from "./home-screen"
import MapScreen from "./map-screen"
import SuggestionsScreen from "./suggestions-screen"
import ProfileScreen from "./profile-screen"

import { Home, Map, Lightbulb, User } from "lucide-react"
import { LocationProvider } from "@/context/location-context"
import DistrictSelectorModal from "@/components/district-selector-modal"
import { useAuth } from "@/context/auth-context"
import { useData } from "@/context/data-context"
import { isReportOwnedByUser } from "@/lib/report-utils"

import OnboardingWalkthrough from "./onboarding-walkthrough"

export default function CitizenApp() {
  const { userRole } = useAuth()
  const { user } = useData()

  if (!userRole) {
    return <OnboardingWalkthrough />
  }

  return (
    <LocationProvider initialDistrict={user?.district}>
      <CitizenAppContent />
      <DistrictSelectorModal />
    </LocationProvider>
  )
}

function CitizenAppContent() {
  const [activeTab, setActiveTab] = useState("home")
  const { reports, addReport } = useData()

  const { user } = useData()
  const myReportsCount = reports.filter((report) => isReportOwnedByUser(report, user)).length

  const renderScreen = () => {
    switch (activeTab) {
      case "home":
        return <HomeScreen addReport={addReport} reportsCount={myReportsCount} />
      case "map":
        return <MapScreen onNavigate={setActiveTab} />
      case "suggestions":
        return <SuggestionsScreen onNavigate={setActiveTab} />
      case "profile":
        return <ProfileScreen onNavigate={setActiveTab} />
      default:
        return <HomeScreen addReport={addReport} reportsCount={myReportsCount} />
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      <div className="flex-1 overflow-hidden">{renderScreen()}</div>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around pb-safe">
        {[
          { id: "home", icon: Home, label: "Home" },
          { id: "map", icon: Map, label: "Map" },
          { id: "suggestions", icon: Lightbulb, label: "Suggestions" },
          { id: "profile", icon: User, label: "Profile" },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center w-20 h-16 transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Icon className={`h-6 w-6 ${isActive ? "fill-current" : ""}`} />
              <span className={`text-xs mt-1 ${isActive ? "font-bold" : "font-medium"}`}>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
