"use client"

import { useState } from "react"
import { useUserLocation } from "@/context/location-context"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { JEDDAH_DISTRICTS, type District } from "@/constants/districts"
import { MapPin } from "lucide-react"

export default function DistrictSelectorModal() {
  const { district, setDistrict, detectLocation, isLoading } = useUserLocation()
  const [isDismissed, setIsDismissed] = useState(false)
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null)
  const needsDistrict = !district || district === "Select District" || district === "Unknown District"
  const isOpen = needsDistrict && !isDismissed

  const handleConfirm = () => {
    if (selectedDistrict) {
      setDistrict(selectedDistrict.name)
      setIsDismissed(true)
    }
  }

  const handleDetectLocation = async () => {
    await detectLocation()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && setIsDismissed(true)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Your District</DialogTitle>
          <DialogDescription>Please select your district to personalize your experience</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">District</label>
            <Select
              value={selectedDistrict?.id}
              onValueChange={(id) => {
                const dist = JEDDAH_DISTRICTS.find((d) => d.id === id)
                if (dist) setSelectedDistrict(dist)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose your district" />
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full bg-transparent"
            onClick={handleDetectLocation}
            disabled={isLoading}
          >
            <MapPin className="h-4 w-4 mr-2" />
            {isLoading ? "Detecting..." : "Detect My Location"}
          </Button>

          <Button onClick={handleConfirm} className="w-full" disabled={!selectedDistrict && !district}>
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
