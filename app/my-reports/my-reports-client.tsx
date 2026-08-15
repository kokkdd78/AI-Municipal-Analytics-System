"use client"

import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, MapPin, Calendar, FileText, RefreshCw } from "lucide-react"
import StaticMap from "@/components/static-map"
import { useData } from "@/context/data-context"
import { formatReportStatus } from "@/lib/report-utils"
import type { ReportStatus } from "@/types/domain"
import AuthenticatedRoleBoundary from "@/components/authenticated-role-boundary"

export default function MyReportsPage() {
  return (
    <AuthenticatedRoleBoundary role="Citizen">
      <MyReportsContent />
    </AuthenticatedRoleBoundary>
  )
}

function MyReportsContent() {
  const router = useRouter()
  const { myReports: reports, reportLoadState, refreshReports } = useData()

  const getStatusBadgeVariant = (status: ReportStatus) => {
    switch (status) {
      case "resolved":
        return "default"
      case "in-progress":
        return "secondary"
      case "pending":
        return "outline"
      default:
        return "outline"
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-background border-b border-border z-10">
        <div className="px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/citizen-app")} className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Reports</h1>
            <p className="text-sm text-muted-foreground">
              {reportLoadState.isLoading ? "Loading reports…" : `${reports.length} total reports`}
            </p>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="px-6 py-6">
        {reportLoadState.error && reports.length > 0 && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
            <p className="text-sm text-destructive">{reportLoadState.error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refreshReports()}>
              Retry server reports
            </Button>
          </div>
        )}
        {reportLoadState.isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center" role="status">
            <RefreshCw className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading your reports…</p>
          </div>
        ) : reportLoadState.error && reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center" role="alert">
            <FileText className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Unable to load reports</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">{reportLoadState.error}</p>
            <Button onClick={() => void refreshReports()} disabled={reportLoadState.isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${reportLoadState.isRefreshing ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        ) : reports.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-muted rounded-full p-6 mb-4">
              <FileText className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">No reports submitted yet</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Start making a difference in your community by submitting your first report
            </p>
            <Button onClick={() => router.push("/citizen-app")} className="bg-primary hover:bg-primary/90">
              Submit a Report
            </Button>
          </div>
        ) : (
          // Reports grid
          <div className="space-y-4">
            {reports.map((report) => {
              const { lat, lng } = report.location

              return (
                <Card
                  key={report.id}
                  className="p-4 bg-card border-border cursor-pointer hover:bg-accent/50 transition-all active:scale-[0.98]"
                  onClick={() => router.push(`/report/track/${report.id}`)}
                >
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-20 h-20 bg-muted rounded-lg overflow-hidden">
                      <div className="w-full h-full">
                        <StaticMap lat={lat} lng={lng} />
                      </div>
                    </div>

                    {/* Report Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-foreground truncate">
                          {report.title}
                        </h3>
                        <Badge variant={getStatusBadgeVariant(report.status)} className="flex-shrink-0">
                          {formatReportStatus(report.status)}
                        </Badge>
                      </div>

                      {report.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{report.description}</p>
                      )}

                      {report.source === "legacy" && (
                        <Badge variant="outline" className="mb-2 text-[10px]">Stored on this device</Badge>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate max-w-[100px]">{report.district}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(report.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
