"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { getStaticMapUrl } from "@/app/actions/static-map"

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
            lat,
            lng,
            status: "pending",
            title: label || "Location",
            votes: 0, // Added required votes property
          },
        ]}
        suggestions={[]}
        suggestionsVisible={false}
        onPinClick={() => { }}
        zoom={15}
      />
    </div>
  )
}
