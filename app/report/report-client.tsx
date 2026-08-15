"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import MapSelectorModal from "@/components/map-selector-modal"
import { useToast } from "@/hooks/use-toast"
import { X, MapPin, Trash2, Lightbulb, AlertCircle, Camera } from "lucide-react"
import Image from "next/image"
import AuthenticatedRoleBoundary from "@/components/authenticated-role-boundary"
import { useAuth } from "@/context/auth-context"
import { useData } from "@/context/data-context"
import { ReportClientError, reportClientErrorMessage } from "@/lib/reports/client"
import { MAX_REPORT_IMAGE_BYTES, REPORT_IMAGE_MIME_TYPES } from "@/lib/report-images/contracts"
import { findDistrictByName } from "@/constants/districts"
import {
  createReportFormOperationGate,
  hasValidReportCoordinates,
  INITIAL_EXPLICIT_REPORT_LOCATION,
  requestBrowserReportCoordinates,
  reportRequestForExplicitLocation,
  reportSuccessPath,
  submitReportWithOptionalImage,
  type ExplicitReportLocation,
} from "@/lib/reports/form-operation"
import { useRouter } from "next/navigation"

export default function ReportPage() {
  return (
    <AuthenticatedRoleBoundary role="Citizen">
      <ReportPageContent />
    </AuthenticatedRoleBoundary>
  )
}

function ReportPageContent() {
  const { toast } = useToast()
  const router = useRouter()
  const { user } = useAuth()
  const { createReport, uploadReportImage, isCreatingReport } = useData()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [createdReportId, setCreatedReportId] = useState<string | null>(null)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<ExplicitReportLocation | null>(
    INITIAL_EXPLICIT_REPORT_LOCATION,
  )
  const [showMap, setShowMap] = useState(false)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const operationGateRef = useRef(createReportFormOperationGate())
  const locationRequestActiveRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const operationGate = operationGateRef.current
    return () => {
      mountedRef.current = false
      locationRequestActiveRef.current = false
      operationGate.dispose()
    }
  }, [])

  useEffect(() => () => {
    if (uploadedImage?.startsWith("blob:")) URL.revokeObjectURL(uploadedImage)
  }, [uploadedImage])

  const issueTypes = [
    { id: "pothole", label: "Pothole", icon: AlertCircle },
    { id: "light", label: "Broken Light", icon: Lightbulb },
    { id: "trash", label: "Trash", icon: Trash2 },
    { id: "other", label: "Other", icon: AlertCircle },
  ]

  const selectImage = (file: File) => {
    if (!REPORT_IMAGE_MIME_TYPES.includes(file.type.toLowerCase() as (typeof REPORT_IMAGE_MIME_TYPES)[number])) {
      toast({ title: "Unsupported Image", description: "Choose a JPEG, PNG, or WebP image.", variant: "destructive" })
      return
    }
    if (file.size <= 0 || file.size > MAX_REPORT_IMAGE_BYTES) {
      toast({ title: "Image Too Large", description: "Choose an image up to 5 MB.", variant: "destructive" })
      return
    }
    if (uploadedImage?.startsWith("blob:")) URL.revokeObjectURL(uploadedImage)
    setSelectedImageFile(file)
    setUploadedImage(URL.createObjectURL(file))
    setImageUploadError(null)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) selectImage(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) selectImage(file)
  }

  const handleClose = () => {
    if (submitting || isCreatingReport || !operationGateRef.current.canClose()) return
    router.push("/citizen-app")
  }

  const handleMapLocation = (lat: number, lng: number, districtName: string) => {
    const coordinates = { lat, lng }
    const district = findDistrictByName(districtName)
    if (!hasValidReportCoordinates(coordinates) || !district) {
      setLocationError("تعذر تأكيد الحي لهذا الموقع. اختر نقطة داخل حي مدعوم في جدة.")
      return
    }
    setSelectedLocation({ ...coordinates, districtId: district.id, districtName: district.name, source: "map" })
    setLocationError(null)
    setShowMap(false)
  }

  const handleBrowserLocation = async () => {
    if (locationRequestActiveRef.current || submitting || isCreatingReport) return
    locationRequestActiveRef.current = true
    setDetectingLocation(true)
    setLocationError(null)
    try {
      const coordinates = await requestBrowserReportCoordinates(navigator.geolocation)
      if (!mountedRef.current) return
      if (!user?.district) {
        setLocationError("تعذر تأكيد حي البلاغ من الحساب. اختر الموقع والحي من الخريطة.")
        return
      }
      setSelectedLocation({
        ...coordinates,
        districtId: user.district.id,
        districtName: user.district.name,
        source: "browser",
      })
    } catch {
      if (mountedRef.current) {
        setLocationError("تعذر تحديد موقعك. لم يتم استخدام أي موقع افتراضي؛ اختر الموقع من الخريطة.")
      }
    } finally {
      locationRequestActiveRef.current = false
      if (mountedRef.current) setDetectingLocation(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedType || !description.trim()) {
      toast({
        title: "Incomplete Form",
        description: "Please select an issue type and add a description.",
        variant: "destructive",
      })
      return
    }

    const request = reportRequestForExplicitLocation(selectedType, description, selectedLocation)
    if (!request) {
      setLocationError("يرجى تحديد موقع صحيح للبلاغ من الخريطة أو باستخدام موقعك الحالي.")
      return
    }

    const operation = operationGateRef.current.begin()
    if (!operation) return
    setSubmitting(true)
    try {
      const result = await submitReportWithOptionalImage({
        existingReportId: createdReportId,
        report: request,
        image: selectedImageFile,
        signal: operation.signal,
        createReport: (report, signal) => createReport(report, { signal }),
        uploadImage: (reportId, image, signal) => uploadReportImage(reportId, image, { signal }),
      })
      const reportId = result.reportId
      setCreatedReportId(reportId)
      if (result.image === "failed") {
        if (operationGateRef.current.isCurrent(operation)) {
          const message = "Your report was saved, but its image could not be uploaded. Retry the image without creating another report."
          setImageUploadError(message)
          toast({ title: "Report Saved — Image Failed", description: message, variant: "destructive" })
        }
        return
      }
      setImageUploadError(null)
      if (operationGateRef.current.commitNavigation(operation)) {
        router.push(reportSuccessPath(reportId))
      }
    } catch (error) {
      if (operationGateRef.current.isCurrent(operation) && !(error instanceof ReportClientError && error.kind === "aborted")) {
          toast({
            title: createdReportId ? "Image Not Uploaded" : "Report Not Submitted",
            description: createdReportId ? imageUploadError ?? "Retry the image upload." : reportClientErrorMessage(error),
            variant: "destructive",
          })
      }
    } finally {
      if (operationGateRef.current.finish(operation)) setSubmitting(false)
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col pb-8">
      {showMap && (
        <MapSelectorModal
          onClose={() => setShowMap(false)}
          onSelect={handleMapLocation}
        />
      )}
      {/* Header */}
      <div className="px-6 pt-4 pb-4 bg-card border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Report an Issue</h1>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleClose}
          disabled={submitting || isCreatingReport}
          aria-label="Close report form"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Location Preview */}
        <div className="mb-8">
          <label className="text-sm font-semibold text-foreground mb-2 block">Selected Location</label>
          <Card className="p-4 bg-slate-100 border border-border rounded-lg overflow-hidden min-h-32">
            <div className="flex items-start gap-3">
              <MapPin className="h-7 w-7 text-primary shrink-0" />
              <div className="min-w-0">
                {selectedLocation ? (
                  <>
                    <p className="font-medium text-foreground">{selectedLocation.districtName}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedLocation.source === "browser"
                        ? "الحي المعتمد من حسابك؛ الإحداثيات من موقع المتصفح."
                        : "تم تأكيد الإحداثيات والحي من اختيار الخريطة."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">لم يتم تحديد موقع للبلاغ.</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => setShowMap(true)} disabled={submitting || isCreatingReport}>
                اختر من الخريطة
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleBrowserLocation()}
                disabled={detectingLocation || submitting || isCreatingReport}
              >
                {detectingLocation ? "جارٍ تحديد الموقع…" : "استخدم موقعي الحالي"}
              </Button>
            </div>
            {locationError && <p className="text-sm text-destructive mt-3" role="alert">{locationError}</p>}
          </Card>
        </div>

        {/* Issue Type Selector */}
        <div className="mb-8">
          <label className="text-sm font-semibold text-foreground mb-3 block">Issue Type</label>
          <div className="grid grid-cols-2 gap-4">
            {issueTypes.map((type) => {
              const IconComponent = type.icon
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedType === type.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-border/80"
                  }`}
                >
                  <IconComponent
                    className={`h-6 w-6 mx-auto mb-2 ${selectedType === type.id ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <p className={`text-xs font-medium ${selectedType === type.id ? "text-primary" : "text-foreground"}`}>
                    {type.label}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Photo Upload */}
        <div className="mb-8">
          <label className="text-sm font-semibold text-foreground mb-2 block">Add Photo</label>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors bg-primary/5"
          >
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="hidden" id="image-upload" />
            <label htmlFor="image-upload" className="cursor-pointer">
              {uploadedImage ? (
                <div className="relative">
                  <Image
                    src={uploadedImage || "/placeholder.svg"}
                    alt="Preview"
                    width={96}
                    height={96}
                    unoptimized
                    className="h-24 w-24 object-cover rounded-lg mx-auto mb-2"
                  />
                  <p className="text-xs text-muted-foreground">Click to change photo</p>
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-destructive"
                    onClick={(event) => {
                      event.preventDefault()
                      if (uploadedImage.startsWith("blob:")) URL.revokeObjectURL(uploadedImage)
                      setUploadedImage(null)
                      setSelectedImageFile(null)
                      setImageUploadError(null)
                    }}
                  >
                    Remove photo
                  </button>
                </div>
              ) : (
                <>
                  <Camera className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">Click or drag photo here</p>
                  <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, or WebP up to 5 MB</p>
                </>
              )}
            </label>
          </div>
        </div>

        {/* Description */}
        <div className="mb-8">
          <label className="text-sm font-semibold text-foreground mb-2 block">Describe the problem...</label>
          <Textarea
            placeholder="Tell us more details about the issue you found..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-24 bg-card border-border text-foreground placeholder:text-muted-foreground rounded-lg resize-none"
          />
        </div>
      </div>

      {/* Submit Button - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-4">
        {imageUploadError && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            <p>{imageUploadError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={submitting}
              onClick={() => createdReportId && router.push(reportSuccessPath(createdReportId))}
            >
              Continue without image
            </Button>
          </div>
        )}
        <Button
          onClick={handleSubmit}
          disabled={submitting || isCreatingReport}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 rounded-lg"
        >
          {submitting || isCreatingReport
            ? createdReportId ? "Uploading Image..." : "Submitting..."
            : createdReportId ? "Retry Image Upload" : "Submit Report"}
        </Button>
      </div>
    </div>
  )
}
