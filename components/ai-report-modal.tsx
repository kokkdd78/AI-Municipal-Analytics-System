"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Camera, X, MapPin } from "lucide-react"
import { useUserLocation } from "@/context/location-context"
import NextImage from "next/image"
import { aiReportSubmissionError } from "@/lib/reports/client-state"

interface AiReportModalProps {
  onClose: () => void
}

export default function AiReportModal({ onClose }: AiReportModalProps) {
  const { toast } = useToast()
  const { district } = useUserLocation()
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null)
  const [category, setCategory] = useState("Infrastructure Issue")
  const [description, setDescription] = useState("")

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const MAX_WIDTH = 800
          const MAX_HEIGHT = 800
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          ctx?.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL("image/jpeg", 0.7))
        }
        img.onerror = (error) => reject(error)
      }
      reader.onerror = (error) => reject(error)
    })
  }

  const handleFileUpload = async (file: File) => {
    if (file.type.startsWith("image/")) {
      try {
        const compressedBase64 = await compressImage(file)
        setUploadedPhoto(compressedBase64)
      } catch (error) {
        console.error("Upload error:", error)
        toast({
          title: "Upload Failed",
          description: "Could not upload the image. Please try again.",
          variant: "destructive",
        })
      }
    }
  }

  const handleSubmit = () => {
    if (!description.trim()) {
      toast({
        title: "Description Required",
        description: "Please describe the issue you're reporting.",
        variant: "destructive",
      })
      return
    }
    toast({
      title: "الخدمة غير متاحة حالياً",
      description: aiReportSubmissionError(),
      variant: "destructive",
    })
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-[#1B4D3E]" />
            <DialogTitle>Quick Photo Report</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {!uploadedPhoto ? (
            <div className="border-2 border-dashed rounded-lg p-8 text-center border-primary/30 bg-primary/5">
              <Camera className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Take a Photo</h3>
              <p className="text-sm text-muted-foreground mb-4">Take a photo of the issue you want to report</p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden"
                id="ai-photo-upload"
              />
              <label htmlFor="ai-photo-upload">
                <Button asChild className="bg-[#1B4D3E] hover:bg-[#153D31]">
                  <span>Open Camera</span>
                </Button>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Uploaded Photo */}
              <div className="relative rounded-lg overflow-hidden">
                <NextImage
                  src={uploadedPhoto || "/placeholder.svg"}
                  alt="Uploaded report"
                  width={800}
                  height={512}
                  unoptimized
                  className="w-full h-64 object-cover"
                />
                <button
                  onClick={() => {
                    setUploadedPhoto(null)
                    setDescription("")
                  }}
                  className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Manual Input Form */}
              <div className="space-y-4">
                {/* Auto-detected Location */}
                <div className="bg-slate-100 rounded-lg p-4 flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Report Location</p>
                    <p className="text-xs text-muted-foreground">{district ? `${district}` : "Locating..."}</p>
                  </div>
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                  <Label htmlFor="category">Issue Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pothole">Pothole</SelectItem>
                      <SelectItem value="Broken Sidewalk">Broken Sidewalk</SelectItem>
                      <SelectItem value="Street Lighting">Street Lighting</SelectItem>
                      <SelectItem value="Trash/Debris">Trash/Debris</SelectItem>
                      <SelectItem value="Graffiti">Graffiti</SelectItem>
                      <SelectItem value="Traffic Sign">Traffic Sign</SelectItem>
                      <SelectItem value="Water Leak">Water Leak</SelectItem>
                      <SelectItem value="Infrastructure Issue">Infrastructure Issue</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the issue in detail..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>

                {/* Submit Button */}
                <Button
                  onClick={handleSubmit}
                  className="w-full bg-[#1B4D3E] hover:bg-[#153D31] text-white"
                  size="lg"
                  disabled={!description.trim()}
                >
                  الخدمة غير متاحة حالياً
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
