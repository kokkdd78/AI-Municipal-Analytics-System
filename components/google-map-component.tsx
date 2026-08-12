"use client"

import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api"
import { useMemo, useCallback, useState, useEffect } from "react"
import { getGoogleMapsApiKey } from "@/app/actions/maps"
import type { MapReport, Suggestion } from "@/types/domain"

interface GoogleMapComponentProps {
  center: { lat: number; lng: number }
  zoom?: number
  reports?: MapReport[]
  suggestions?: Suggestion[]
  suggestionsVisible?: boolean
  onPinClick?: (id: string, type: "report" | "suggestion") => void
  onMapClick?: (lat: number, lng: number) => void
  draggable?: boolean
  onCenterChange?: (lat: number, lng: number) => void
}

const containerStyle = {
  width: "100%",
  height: "100%",
}

const defaultCenter = {
  lat: 21.5433,
  lng: 39.1728,
}

export default function GoogleMapComponent({
  center,
  zoom = 13,
  reports = [],
  suggestions = [],
  suggestionsVisible = false,
  onPinClick,
  onMapClick,
  draggable = false,
  onCenterChange,
}: GoogleMapComponentProps) {
  const [apiKey, setApiKey] = useState<string>("")

  useEffect(() => {
    getGoogleMapsApiKey().then(setApiKey)
  }, [])

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
  })

  const [map, setMap] = useState<google.maps.Map | null>(null)

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    setMap(map)
  }, [])

  const onUnmount = useCallback(function callback() {
    setMap(null)
  }, [])

  const handleCenterChanged = () => {
    if (map && onCenterChange) {
      const newCenter = map.getCenter()
      if (newCenter) {
        onCenterChange(newCenter.lat(), newCenter.lng())
      }
    }
  }

  const mapOptions = useMemo(
    () => ({
      disableDefaultUI: false,
      clickableIcons: false,
      scrollwheel: true,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    }),
    [],
  )

  if (!isLoaded) {
    return <div className="h-full w-full bg-muted animate-pulse flex items-center justify-center">Loading Map...</div>
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center || defaultCenter}
      zoom={zoom}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onClick={(e) => {
        if (onMapClick && e.latLng) {
          onMapClick(e.latLng.lat(), e.latLng.lng())
        }
      }}
      onCenterChanged={handleCenterChanged}
      options={mapOptions}
    >
      {/* Report Markers */}
      {reports.map((report) => (
        <Marker
          key={`report-${report.id}`}
          position={report.location}
          onClick={() => onPinClick?.(report.id, "report")}
          icon={{
            url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
          }}
        />
      ))}

      {/* Suggestion Markers */}
      {suggestionsVisible &&
        suggestions.map((suggestion) => (
          <Marker
            key={`suggestion-${suggestion.id}`}
            position={suggestion.location}
            onClick={() => onPinClick?.(suggestion.id, "suggestion")}
            icon={{
              url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
            }}
          />
        ))}

      {/* Draggable Marker for Location Selection */}
      {draggable && center && (
        <Marker
          position={center}
          draggable={false} // We move the map, not the marker usually in these UIs, but if we want draggable marker:
          // draggable={true}
          // onDragEnd={(e) => ...}
          icon={{
            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
          }}
        />
      )}
    </GoogleMap>
  )
}
