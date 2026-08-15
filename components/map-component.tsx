"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet.heat"
import { Button } from "@/components/ui/button"
import { ThumbsUp } from "lucide-react"
import { getReportPhotoUrl } from "@/lib/report-utils"
import type { MapReport, Suggestion } from "@/types/domain"
import Image from "next/image"

// Fix for default marker icons
const iconRetinaUrl = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png"
const iconUrl = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png"
const shadowUrl = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png"

interface MapComponentProps {
  center: { lat: number; lng: number } | [number, number]
  reports?: MapReport[]
  suggestions?: Suggestion[]
  suggestionsVisible?: boolean
  onPinClick?: (id: string, type: "report" | "suggestion") => void
  onReportSelect?: (id: string) => void
  onCenterChange?: (lat: number, lng: number) => void
  zoom?: number
  draggable?: boolean
  votedReports?: Set<string>
  pendingReports?: Set<string>
  votedSuggestions?: Set<string>
}

function CenterTracker({ onCenterChange }: { onCenterChange?: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend(event) {
      const map = event.target
      const currentCenter = map.getCenter()
      onCenterChange?.(currentCenter.lat, currentCenter.lng)
    },
  })
  return null
}

function HeatmapLayer({ reports }: { reports: MapReport[] }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !reports || reports.length === 0) return

    // Calculate intensity based on clustering
    // Group reports within 0.01 degree radius (~1km)
    const clusters = new Map<string, number>()

    reports.forEach((report) => {
      // Round coordinates to create clusters
      const clusterKey = `${Math.round(report.location.lat * 100)}_${Math.round(report.location.lng * 100)}`
      clusters.set(clusterKey, (clusters.get(clusterKey) || 0) + 1)
    })

    // Create heatmap points with intensity based on cluster size
    const heatPoints: [number, number, number][] = reports.map((report) => {
      const clusterKey = `${Math.round(report.location.lat * 100)}_${Math.round(report.location.lng * 100)}`
      const clusterSize = clusters.get(clusterKey) || 1

      // Calculate intensity: higher for more clustered reports
      let intensity = 0.3 // base intensity
      if (clusterSize > 10) {
        intensity = 1.0 // red zone
      } else if (clusterSize > 5) {
        intensity = 0.7 // yellow zone
      } else if (clusterSize > 2) {
        intensity = 0.5 // green/yellow zone
      }

      return [report.location.lat, report.location.lng, intensity]
    })

    // @ts-expect-error leaflet.heat augments Leaflet without TypeScript declarations.
    const heatLayer = L.heatLayer(heatPoints, {
      radius: 40,
      blur: 25,
      maxZoom: 17,
      gradient: {
        0.2: "blue",
        0.4: "lime",
        0.6: "yellow",
        0.9: "red",
      },
    }).addTo(map)

    // Cleanup on unmount
    return () => {
      map.removeLayer(heatLayer)
    }
  }, [map, reports])

  return null
}

export default function MapComponent({
  center,
  reports = [],
  suggestions = [],
  suggestionsVisible = false,
  onPinClick,
  onReportSelect,
  onCenterChange,
  zoom = 13,
  votedReports = new Set(),
  pendingReports = new Set(),
  votedSuggestions = new Set(),
}: MapComponentProps) {
  useEffect(() => {
    // @ts-expect-error Leaflet keeps this internal icon URL helper off its public types.
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl,
      iconUrl,
      shadowUrl,
    })
  }, [])

  const blueIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  })

  const greenIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  })

  const redIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  })

  const getMarkerIcon = (votes: number) => {
    if (votes > 50) return redIcon
    if (votes > 20) return blueIcon
    return blueIcon
  }

  // Normalize center to [lat, lng] array for Leaflet
  const mapCenter: [number, number] = Array.isArray(center) ? center : [center.lat, center.lng]

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <MapContainer center={mapCenter} zoom={zoom} style={{ height: "100%", width: "100%" }} zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CenterTracker onCenterChange={onCenterChange} />

        <HeatmapLayer reports={reports} />

        {reports.map((report) => {
          const photoUrl = report.attachments ? getReportPhotoUrl({ attachments: report.attachments }) : null

          return (
          <Marker
            key={`report-${report.id}`}
            position={[report.location.lat, report.location.lng]}
            icon={getMarkerIcon(report.votes)}
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
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-medium text-muted-foreground">{report.votes} votes</span>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={votedReports.has(report.id) || pendingReports.has(report.id)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPinClick?.(report.id, "report")
                    }}
                  >
                    <ThumbsUp className="h-3 w-3 mr-1" />{
                      pendingReports.has(report.id) ? "Voting…" : votedReports.has(report.id) ? "Voted" : "Upvote"
                    }
                  </Button>
                </div>
              </div>
            </Popup>
          </Marker>
          )
        })}

        {suggestionsVisible &&
          suggestions.map((suggestion) => (
            <Marker
              key={`suggestion-${suggestion.id}`}
              position={[suggestion.location.lat, suggestion.location.lng]}
              icon={greenIcon}
            >
              <Popup className="min-w-[200px]">
                <div className="space-y-2">
                  <div>
                    <p className="font-semibold text-sm">{suggestion.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{suggestion.description}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-medium text-muted-foreground">{suggestion.votes} votes</span>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                      disabled={votedSuggestions.has(suggestion.id)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPinClick?.(suggestion.id, "suggestion")
                      }}
                    >
                      <ThumbsUp className="h-3 w-3 mr-1" /> {votedSuggestions.has(suggestion.id) ? "Voted" : "Upvote"}
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </>
  )
}
