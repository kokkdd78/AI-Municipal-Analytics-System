"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Camera, Sparkles } from "lucide-react"
import { useData } from "@/context/data-context"
import { useState } from "react"
import { useRouter } from "next/navigation"
import ReportFormModal from "./report-form-modal"
import AiReportModal from "./ai-report-modal"
import type { Report } from "@/types/domain"

interface HomeScreenProps {
  addReport?: (report: Report) => void
  reportsCount: number
}

export default function HomeScreen({ addReport, reportsCount }: HomeScreenProps) {
  const { user } = useData()
  const router = useRouter()
  const [showReportModal, setShowReportModal] = useState(false)
  const [showAiReportModal, setShowAiReportModal] = useState(false)

  const firstName = user.name.split(" ")[0] || "User"
  const initials =
    user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "U"

  const handleReportSubmitted = (report: Report) => {
    if (addReport) {
      addReport(report)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Good morning, {firstName}</h1>
          <p className="text-muted-foreground text-sm">Let&apos;s make our city better today</p>
        </div>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${firstName}`} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 pb-24">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card
            className="p-4 bg-card border-border cursor-pointer hover:bg-accent/50 transition-colors active:scale-95"
            onClick={() => router.push("/my-reports")}
          >
            <div className="flex flex-col items-center text-center">
              <p className="text-3xl font-bold text-primary mb-1">{reportsCount}</p>
              <p className="text-xs text-muted-foreground font-medium">Reports Submitted</p>
            </div>
          </Card>
          <Card className="p-4 bg-card border-border">
            <div className="flex flex-col items-center text-center">
              <p className="text-3xl font-bold text-green-600 mb-1">5</p>
              <p className="text-xs text-muted-foreground font-medium">Issues Fixed</p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {/* AI-Assisted Report */}
          <Button
            onClick={() => setShowAiReportModal(true)}
            className="w-full h-32 bg-gradient-to-br from-[#1B4D3E] to-[#2D7A5E] hover:from-[#153D31] hover:to-[#1B4D3E] text-white rounded-xl flex flex-col items-center justify-center gap-3 shadow-lg active:scale-95 transition-all relative overflow-hidden"
          >
            <div className="absolute top-2 right-2 bg-white/20 px-2 py-1 rounded-full text-xs font-medium backdrop-blur-sm">
              AI-Powered
            </div>
            <Sparkles className="h-8 w-8" />
            <div className="text-center">
              <span className="text-lg font-semibold block">Quick Report</span>
              <span className="text-xs opacity-90">Just snap a photo</span>
            </div>
          </Button>

          {/* Manual Report */}
          <Button
            onClick={() => setShowReportModal(true)}
            variant="outline"
            className="w-full h-24 border-2 border-primary text-primary hover:bg-primary/5 rounded-xl flex flex-col items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Camera className="h-6 w-6" />
            <span className="text-sm font-semibold">Detailed Report</span>
          </Button>
        </div>

        {showReportModal && (
          <ReportFormModal onClose={() => setShowReportModal(false)} onReportSubmitted={handleReportSubmitted} />
        )}
        {showAiReportModal && (
          <AiReportModal onClose={() => setShowAiReportModal(false)} onReportSubmitted={handleReportSubmitted} />
        )}
      </div>
    </div>
  )
}
