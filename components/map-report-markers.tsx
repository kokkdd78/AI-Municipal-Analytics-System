import type { MarkerOptions } from "leaflet"
import Image from "next/image"
import { ThumbsUp } from "lucide-react"
import { Marker, Popup } from "react-leaflet"

import { Button } from "./ui/button"
import ReportMapStatus from "./report-map-status"
import { getReportPhotoUrl } from "../lib/report-utils"
import type { MapReport } from "../types/domain"

interface MapReportMarkersProps {
  reports: MapReport[]
  markerIcon: (votes: number) => NonNullable<MarkerOptions["icon"]>
  onPinClick?: (id: string, type: "report") => void
  onReportSelect?: (id: string) => void
  pendingReports: Set<string>
  showReportStatus: boolean
  votedReports: Set<string>
}

export function mapReportMarkerKey(report: Pick<MapReport, "id" | "status">): string {
  return `report-${report.id}-status-${report.status ?? "unspecified"}`
}

export default function MapReportMarkers({
  reports,
  markerIcon,
  onPinClick,
  onReportSelect,
  pendingReports,
  showReportStatus,
  votedReports,
}: MapReportMarkersProps) {
  return reports.map((report) => {
    const photoUrl = report.attachments ? getReportPhotoUrl({ attachments: report.attachments }) : null

    return (
      <Marker
        key={mapReportMarkerKey(report)}
        position={[report.location.lat, report.location.lng]}
        icon={markerIcon(report.votes)}
        eventHandlers={{ click: () => onReportSelect?.(report.id) }}
      >
        <Popup className="min-w-[200px]">
          <div className="space-y-2">
            {photoUrl && (
              <div className="w-full h-32 rounded-md overflow-hidden mb-2">
                <Image
                  src={photoUrl}
                  alt={report.title}
                  width={400}
                  height={256}
                  unoptimized
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div>
              <p className="font-semibold text-sm">{report.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{report.description}</p>
              {showReportStatus && report.status && <ReportMapStatus status={report.status} />}
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-medium text-muted-foreground">{report.votes} votes</span>
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={votedReports.has(report.id) || pendingReports.has(report.id)}
                onClick={(event) => {
                  event.stopPropagation()
                  onPinClick?.(report.id, "report")
                }}
              >
                <ThumbsUp className="h-3 w-3 mr-1" />
                {pendingReports.has(report.id) ? "Voting…" : votedReports.has(report.id) ? "Voted" : "Upvote"}
              </Button>
            </div>
          </div>
        </Popup>
      </Marker>
    )
  })
}
