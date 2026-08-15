"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, MapPin, Clock, AlertTriangle, Home, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useData } from "@/context/data-context"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import dynamic from "next/dynamic"
import { reportStatusStep } from "@/lib/report-utils"

const MapComponent = dynamic(() => import("@/components/map-component"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})

interface ReportTrackingView {
  id: string
  type: string
  createdAt: string
  district: string
  severity: string
  location: { lat: number; lng: number }
  currentStatus: number
  timeline: { time: string; text: string }[]
}

export default function ReportTrackingPage() {
  const params = useParams()
  const router = useRouter()
  const { reports } = useData()
  const reportId = params.id as string
  const [report, setReport] = useState<ReportTrackingView | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMapOpen, setIsMapOpen] = useState(false)

  useEffect(() => {
    const fetchReportStatus = async () => {
      try {
        const actualReport = reports.find((r) => r.id === reportId)

        if (actualReport) {
          const reportStatus: ReportTrackingView = {
            id: actualReport.id,
            type: actualReport.title,
            createdAt: actualReport.createdAt,
            district: actualReport.district,
            severity: actualReport.severity ? `${actualReport.severity.charAt(0).toUpperCase()}${actualReport.severity.slice(1)}` : "Medium",
            location: actualReport.location,
            currentStatus: reportStatusStep(actualReport.status),
            timeline: [
              {
                time: new Date(actualReport.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                text: "Report submitted",
              },
            ],
          }
          setReport(reportStatus)
        } else {
          const response = await fetch(`/api/report-status/${reportId}`)
          if (response.ok) {
            const data = (await response.json()) as ReportTrackingView
            setReport(data)
          }
        }
      } catch (error) {
        console.error("Error fetching report:", error)
      } finally {
        setLoading(false)
      }
    }

    if (reportId) {
      fetchReportStatus()
    }
  }, [reportId, reports])

  const statusSteps = [
    { label: "Report received", icon: "📥" },
    { label: "Under review", icon: "👀" },
    { label: "In progress", icon: "🔧" },
    { label: "Resolved", icon: "✅" },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">Loading report details...</p>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <Button variant="ghost" onClick={() => router.push("/citizen-app")} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
          </Button>
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Report not found</p>
          </Card>
        </div>
      </div>
    )
  }

  const formattedDate = new Date(report.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  const formatTimelineTime = (timeString: string) => {
    if (timeString.includes(":")) {
      return timeString
    }
    return new Date(timeString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex-1 text-center">Report Tracking</h1>
          <Button
            variant="ghost"
            onClick={() => router.push("/citizen-app")}
            size="sm"
            title="Return to Home"
            aria-label="Return to home page"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>

        <Card className="p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Report ID</p>
              <p className="text-sm font-medium text-foreground break-all">{report.id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Issue Type</p>
              <p className="text-sm font-medium text-foreground">{report.type}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Submission Date</p>
              <p className="text-sm font-medium text-foreground">{formattedDate}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Location</p>
              <p className="text-sm font-medium text-foreground">{report.district}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Severity</p>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span
                  className={`text-sm font-medium px-3 py-1 rounded-full ${report.severity === "High"
                    ? "bg-destructive/20 text-destructive"
                    : report.severity === "Medium"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-blue-100 text-blue-800"
                    }`}
                >
                  {report.severity}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-6">Status Progress</h2>
          <div className="space-y-4">
            {statusSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold transition-all ${index <= report.currentStatus
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                      } ${index === report.currentStatus ? "animate-pulse ring-4 ring-primary/30" : ""}`}
                  >
                    {index + 1}
                  </div>
                  {index < statusSteps.length - 1 && (
                    <div className="relative w-1 h-8 mt-2 bg-muted overflow-hidden">
                      {index < report.currentStatus && <div className="absolute inset-0 bg-primary"></div>}
                      {index === report.currentStatus && (
                        <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary/50 to-transparent animate-pulse"></div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`font-medium ${index <= report.currentStatus ? "text-foreground" : "text-muted-foreground"
                      }`}
                  >
                    {step.label}
                  </p>
                  {index === report.currentStatus && (
                    <p className="text-xs text-primary font-semibold mt-1 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                      Current Step
                    </p>
                  )}
                  {index === report.currentStatus + 1 && report.currentStatus < statusSteps.length - 1 && (
                    <p className="text-xs text-muted-foreground font-medium mt-1 flex items-center gap-1">
                      <span className="inline-block">→</span>
                      Next Step
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          className="p-6 mb-6 cursor-pointer hover:border-primary/50 transition-all"
          onClick={() => setIsMapOpen(true)}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                <MapPin className="h-5 w-5" /> Location
              </h2>
              <p className="text-base font-medium text-foreground">{report.district}</p>
              {report.location && (
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {report.location.lat.toFixed(6)}, {report.location.lng.toFixed(6)}
                </p>
              )}
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center w-full">Tap to view on map</p>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5" /> Timeline
          </h2>
          <div className="space-y-4">
            {report.timeline.map((event, index) => (
              <div key={index} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  {index < report.timeline.length - 1 && <div className="w-0.5 h-12 bg-border mt-2"></div>}
                </div>
                <div className="pb-4">
                  <p className="font-medium text-foreground text-sm">{event.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatTimelineTime(event.time)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Dialog open={isMapOpen} onOpenChange={setIsMapOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden h-[60vh] flex flex-col">
          <div className="relative h-full w-full">
            {report.location && (
              <MapComponent
                center={{ lat: report.location.lat, lng: report.location.lng }}
                zoom={15}
                reports={[
                  {
                    id: report.id,
                    location: report.location,
                    title: report.type,
                    description: report.district,
                    votes: 0,
                    attachments: [],
                  },
                ]}
              />
            )}
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 right-4 z-[1000] rounded-full shadow-lg"
              onClick={() => setIsMapOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
