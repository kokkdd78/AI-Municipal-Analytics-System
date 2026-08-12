"use client"

import dynamic from "next/dynamic"

const MapComponent = dynamic(() => import("./map-component"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-md bg-muted flex items-center justify-center">
      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  ),
})

interface StaticMapProps {
  lat: number
  lng: number
  label?: string
}

export default function StaticMap({ lat, lng, label }: StaticMapProps) {
  return (
    <div className="w-full h-full rounded-md overflow-hidden">
      <MapComponent
        center={[lat, lng]}
        reports={[
          {
            id: "location",
            location: { lat, lng },
            title: label || "Location",
            votes: 0,
            attachments: [],
          },
        ]}
        suggestions={[]}
        suggestionsVisible={false}
        onPinClick={() => {}}
        zoom={15}
      />
    </div>
  )
}
