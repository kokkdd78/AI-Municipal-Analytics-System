"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { MapPin, X } from "lucide-react"
import dynamic from "next/dynamic"
import {
  confirmedNominatimMapReportLocation,
  type ExplicitReportLocation,
} from "@/lib/reports/form-operation"

const MapComponent = dynamic(() => import("./map-component"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})

interface MapSelectorModalProps {
  onClose: () => void
  onSelect: (lat: number, lng: number, districtName: string, districtId: string) => void
  initialCenter?: [number, number]
}

async function reverseGeocode(lat: number, lng: number): Promise<ExplicitReportLocation | null> {
  try {
    const parameters = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      lat: String(lat),
      lon: String(lng),
    })
    const url = `https://nominatim.openstreetmap.org/reverse?${parameters}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (!data || typeof data !== "object" || !("address" in data)) return null
    const address = data.address
    if (!address || typeof address !== "object") return null
    return confirmedNominatimMapReportLocation(lat, lng, address)
  } catch {
    return null
  }
}

export default function MapSelectorModal({ onClose, onSelect, initialCenter }: MapSelectorModalProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(initialCenter ?? [21.5433, 39.1728]) // Default viewport: Jeddah
  const [locationError, setLocationError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const handleLocationSelect = async () => {
    if (confirming) return
    setConfirming(true)
    setLocationError(null)
    const [lat, lng] = mapCenter
    const location = await reverseGeocode(lat, lng)
    if (!location) {
      setLocationError("This location could not be matched to a supported district. Please choose another location.")
      setConfirming(false)
      return
    }
    onSelect(location.lat, location.lng, location.districtName, location.districtId)
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden h-[80vh] flex flex-col">
        <div className="relative flex-1">
          <MapComponent
            center={mapCenter}
            reports={[]}
            suggestions={[]}
            suggestionsVisible={false}
            onPinClick={() => {}}
            onCenterChange={(lat: number, lng: number) => {
              setMapCenter([lat, lng])
              setLocationError(null)
            }}
          />

          <Button
            variant="secondary"
            size="icon"
            className="absolute top-4 right-4 z-[1000] rounded-full shadow-lg"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="absolute bottom-8 left-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 z-[1000] space-y-2 text-center">
            {locationError && <p className="rounded-md bg-white px-3 py-2 text-sm font-medium text-destructive shadow-lg" role="alert">{locationError}</p>}
            <Button className="shadow-lg bg-[#1B4D3E] hover:bg-[#1B4D3E]/90 text-white" onClick={() => void handleLocationSelect()} disabled={confirming}>
              {confirming ? "Confirming location…" : "Set Location Here"}
            </Button>
          </div>

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] pointer-events-none">
            <MapPin className="h-8 w-8 text-[#1B4D3E] -mb-8 drop-shadow-lg" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
