"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { MapPin, X } from "lucide-react"
import dynamic from "next/dynamic"

const MapComponent = dynamic(() => import("./map-component"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})

interface MapSelectorModalProps {
  onClose: () => void
  onSelect: (lat: number, lng: number, district: string) => void
}

// Helper to get address from coordinates
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    const res = await fetch(url)
    const data = await res.json()

    const addr = data?.address || {}

    const districtName =
      addr.suburb || addr.neighbourhood || addr.city_district || addr.town || addr.city || "Unknown Location"

    return districtName
  } catch {
    return "Unknown Location"
  }
}

export default function MapSelectorModal({ onClose, onSelect }: MapSelectorModalProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([21.5433, 39.1728]) // Default to Jeddah

  const handleLocationSelect = async () => {
    const [lat, lng] = mapCenter
    const district = await reverseGeocode(lat, lng)
    onSelect(lat, lng, district)
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
            onCenterChange={(lat: number, lng: number) => setMapCenter([lat, lng])}
          />

          <Button
            variant="secondary"
            size="icon"
            className="absolute top-4 right-4 z-[1000] rounded-full shadow-lg"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000]">
            <Button className="shadow-lg bg-[#1B4D3E] hover:bg-[#1B4D3E]/90 text-white" onClick={handleLocationSelect}>
              Set Location Here
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
