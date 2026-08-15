"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Trees, Lightbulb, Zap, MapPin, X, HelpCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useData } from "@/context/data-context"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { JEDDAH_DISTRICTS, type District, findDistrictByName } from "@/constants/districts"
import { SuggestionClientError, suggestionClientErrorMessage } from "@/lib/suggestions/client"
import { useToast } from "@/hooks/use-toast"

const MapComponent = dynamic(() => import("./map-component"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})

interface NewSuggestionProposalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  district: string
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    const res = await fetch(url)
    const data = await res.json()

    const addr = data?.address || {}

    const districtName = addr.suburb || addr.neighbourhood || addr.city_district || addr.town || addr.city

    const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`

    if (districtName) {
      return `${districtName} (${coords})`
    }

    return data.display_name || coords
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }
}

export default function NewSuggestionProposal({ open, onOpenChange, district }: NewSuggestionProposalProps) {
  const { toast } = useToast()
  const { addSuggestion, isCreatingSuggestion } = useData()
  const [selectedCategory, setSelectedCategory] = useState("park")
  const [customCategory, setCustomCategory] = useState("")
  const [description, setDescription] = useState("")
  const [selectedAddress, setSelectedAddress] = useState(district || "")
  const [showMap, setShowMap] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const operationRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const [selectedDistrict, setSelectedDistrict] = useState<District>(
    findDistrictByName(district) || JEDDAH_DISTRICTS[0],
  )

  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>({
    lat: 21.5433,
    lng: 39.1728,
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      operationRef.current?.abort()
      operationRef.current = null
    }
  }, [])

  const handleMapDrag = () => {
    setShowMap(true)
  }

  const handleLocationSelect = async () => {
    if (!mapCenter) return
    const { lat, lng } = mapCenter

    const label = await reverseGeocode(lat, lng)
    setSelectedAddress(label)
    setShowMap(false)
  }

  const handleSubmit = async () => {
    if (!description.trim() || operationRef.current) return

    const category = (selectedCategory === "other" ? customCategory : selectedCategory).trim()
    const title = selectedCategory === "other"
      ? customCategory.trim()
      : CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? "Suggestion"
    if (!category || !title || !mapCenter) return

    const controller = new AbortController()
    operationRef.current = controller
    setSubmitting(true)
    try {
      await addSuggestion({
        title,
        category,
        location: mapCenter,
        description: description.trim(),
        districtId: selectedDistrict.id,
      }, { signal: controller.signal })
      if (!mountedRef.current || controller.signal.aborted) return
      setDescription("")
      setSelectedCategory("park")
      setCustomCategory("")
      setSelectedAddress(district)
      setSelectedDistrict(findDistrictByName(district) || JEDDAH_DISTRICTS[0])
      onOpenChange(false)
    } catch (error) {
      if (
        mountedRef.current
        && !(error instanceof SuggestionClientError && error.kind === "aborted")
      ) {
        toast({
          title: "Suggestion Not Submitted",
          description: suggestionClientErrorMessage(error),
          variant: "destructive",
        })
      }
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null
        if (mountedRef.current) setSubmitting(false)
      }
    }
  }

  if (showMap) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
        <DialogContent className="max-w-md p-0 overflow-hidden h-[80vh] flex flex-col">
          <div className="relative flex-1">
            <MapComponent
              center={mapCenter || { lat: 21.5433, lng: 39.1728 }}
              onCenterChange={(lat, lng) => setMapCenter({ lat, lng })}
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 right-4 z-[1000] rounded-full shadow-lg"
              onClick={() => setShowMap(false)}
              disabled={submitting}
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000]">
              <Button className="shadow-lg" onClick={handleLocationSelect}>
                Set Location Here
              </Button>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] pointer-events-none">
              <MapPin className="h-8 w-8 text-primary -mb-8 drop-shadow-lg" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
      <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="h-40 bg-gradient-to-b from-blue-100 to-blue-50 relative flex items-center justify-center border-b border-border">
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">Tap to open map</p>
            <button
              onClick={handleMapDrag}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Set Location on Map
            </button>
            <div className="flex justify-center">
              <MapPin className="h-8 w-8 text-primary/20 absolute bottom-2 right-4 rotate-12" />
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg border border-border">
            <p className="text-xs text-muted-foreground mb-1">Selected Address</p>
            <p className="font-semibold text-foreground">{selectedAddress || "Select location on map"}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground mb-2">District</p>
            <Select
              value={selectedDistrict.id}
              onValueChange={(id) => {
                const dist = JEDDAH_DISTRICTS.find((d) => d.id === id)
                if (dist) setSelectedDistrict(dist)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select district" />
              </SelectTrigger>
              <SelectContent>
                {JEDDAH_DISTRICTS.map((dist) => (
                  <SelectItem key={dist.id} value={dist.id}>
                    {dist.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Category</p>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => {
                const CatIcon = cat.icon
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedCategory === cat.id
                        ? "bg-primary text-white"
                        : `${cat.color} text-foreground hover:opacity-80`
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <CatIcon className="h-4 w-4" />
                      {cat.label}
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedCategory === "other" && (
              <div className="mt-2">
                <Input
                  placeholder="Enter category name..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Why is this needed?</label>
            <Textarea
              placeholder="Explain why this improvement would benefit your community..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-24 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting || isCreatingSuggestion || !description.trim() || (selectedCategory === "other" && !customCategory.trim())}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {submitting || isCreatingSuggestion ? "Submitting..." : "Submit Proposal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const CATEGORIES = [
  { id: "park", label: "New Park", icon: Trees, color: "bg-green-100" },
  { id: "lighting", label: "Lighting", icon: Lightbulb, color: "bg-yellow-100" },
  { id: "crosswalk", label: "Crosswalk", icon: Zap, color: "bg-blue-100" },
  { id: "shade", label: "Shade Structure", icon: MapPin, color: "bg-purple-100" },
  { id: "other", label: "Other", icon: HelpCircle, color: "bg-gray-100" },
]
