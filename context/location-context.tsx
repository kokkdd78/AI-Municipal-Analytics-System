"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface Coordinates {
  lat: number
  lng: number
}

interface LocationContextType {
  location: Coordinates | null
  district: string | null
  isLoading: boolean
  error: string | null
  setLocation: (location: Coordinates) => void
  setDistrict: (district: string) => void
  detectLocation: () => Promise<void>
}

const LocationContext = createContext<LocationContextType | undefined>(undefined)

export function LocationProvider({ children, initialDistrict }: { children: ReactNode; initialDistrict?: string }) {
  const [location, setLocation] = useState<Coordinates | null>(null)
  const [district, setDistrict] = useState<string | null>(initialDistrict || null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialDistrict) {
      setDistrict(initialDistrict)
    }
  }, [initialDistrict])

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            "User-Agent": "JariApp/1.0",
          },
        },
      )
      const data = await response.json()

      // Extract district or neighborhood or suburb or city district
      const address = data.address
      const detectedDistrict =
        address.neighbourhood ||
        address.suburb ||
        address.district ||
        address.quarter ||
        address.city_district ||
        "Unknown District"

      setDistrict(detectedDistrict)
    } catch (err) {
      console.error("Reverse geocoding failed:", err)
      // Fallback if API fails
      setDistrict("Select District")
    }
  }

  const detectLocation = async () => {
    setIsLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser")
      setIsLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        setLocation({ lat: latitude, lng: longitude })
        await reverseGeocode(latitude, longitude)
        setIsLoading(false)
      },
      (err) => {
        console.error("Geolocation error:", err)
        setError("Location permission denied")
        setIsLoading(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      },
    )
  }

  // Auto-detect on mount only if no initial district
  useEffect(() => {
    if (!initialDistrict) {
      detectLocation()
    }
  }, [initialDistrict])

  return (
    <LocationContext.Provider
      value={{
        location,
        district,
        isLoading,
        error,
        setLocation,
        setDistrict,
        detectLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  )
}

export function useUserLocation() {
  const context = useContext(LocationContext)
  if (context === undefined) {
    throw new Error("useUserLocation must be used within a LocationProvider")
  }
  return context
}
