"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useEffect, useRef, useState } from "react"
import { MapPin, AlertTriangle, Droplets, Lightbulb, Trees, Trash2, HelpCircle } from "lucide-react"
import MapSelectorModal from "./map-selector-modal"
import { useToast } from "@/hooks/use-toast"
import { useData } from "@/context/data-context"
import Image from "next/image"
import { useAuth } from "@/context/auth-context"
import { findDistrictByName } from "@/constants/districts"
import { ReportClientError, reportClientErrorMessage } from "@/lib/reports/client"
import { MAX_REPORT_IMAGE_BYTES, REPORT_IMAGE_MIME_TYPES } from "@/lib/report-images/contracts"
import {
  createReportFormOperationGate,
  reportDescriptionForSubmission,
  reportSuccessPath,
  submitReportWithOptionalImage,
} from "@/lib/reports/form-operation"
import { useRouter } from "next/navigation"

const issueTypes = [
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "lighting", label: "Lighting", icon: Lightbulb },
  { id: "pothole", label: "Pothole", icon: AlertTriangle },
  { id: "water", label: "Water", icon: Droplets },
  { id: "trees", label: "Trees", icon: Trees },
  { id: "other", label: "Other", icon: HelpCircle },
]

interface ReportFormModalProps {
  onClose: () => void
}

interface FormErrors {
  issueType?: string
  otherDescription?: string
  description?: string
  location?: string
}

export default function ReportFormModal({ onClose }: ReportFormModalProps) {
  const { toast } = useToast()
  const router = useRouter()
  const { user: authenticatedUser } = useAuth()
  const { user, createReport, uploadReportImage, isCreatingReport } = useData()
  const [loading, setLoading] = useState(false)
  const operationGateRef = useRef(createReportFormOperationGate())

  const [selectedIssueType, setSelectedIssueType] = useState("")
  const [otherDescription, setOtherDescription] = useState("")
  const [description, setDescription] = useState("")
  const [selectedLat, setSelectedLat] = useState<number | null>(21.5433)
  const [selectedLng, setSelectedLng] = useState<number | null>(39.1728)
  const [selectedDistrictName, setSelectedDistrictName] = useState(
    authenticatedUser?.district?.name ?? user?.district ?? "",
  )
  const [selectedDistrictId, setSelectedDistrictId] = useState(authenticatedUser?.district?.id ?? "")
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null)
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null)
  const [createdReportId, setCreatedReportId] = useState<string | null>(null)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)

  const [showMap, setShowMap] = useState(false)
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  useEffect(() => () => operationGateRef.current.dispose(), [])
  useEffect(() => () => {
    if (uploadedPhoto?.startsWith("blob:")) URL.revokeObjectURL(uploadedPhoto)
  }, [uploadedPhoto])

  const selectPhoto = (file: File) => {
    if (!REPORT_IMAGE_MIME_TYPES.includes(file.type.toLowerCase() as (typeof REPORT_IMAGE_MIME_TYPES)[number])) {
      toast({ title: "Unsupported Image", description: "Choose a JPEG, PNG, or WebP image.", variant: "destructive" })
      return
    }
    if (file.size <= 0 || file.size > MAX_REPORT_IMAGE_BYTES) {
      toast({ title: "Image Too Large", description: "Choose an image up to 4 MB.", variant: "destructive" })
      return
    }
    if (uploadedPhoto?.startsWith("blob:")) URL.revokeObjectURL(uploadedPhoto)
    setSelectedPhotoFile(file)
    setUploadedPhoto(URL.createObjectURL(file))
    setImageUploadError(null)
  }

  const handleSubmit = async () => {
    const errors: FormErrors = {}

    if (!selectedIssueType) {
      errors.issueType = "Please select an issue type"
    }

    if (!description.trim()) {
      errors.description = "Please enter a description"
    }

    if (selectedIssueType === "other" && !otherDescription.trim()) {
      errors.otherDescription = "Please specify the issue"
    }

    if (selectedLat === null || selectedLng === null || !selectedDistrictId) {
      errors.location = "Please select a location on the map"
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    const submissionDescription = reportDescriptionForSubmission(
      selectedIssueType,
      otherDescription,
      description,
    )
    if (!submissionDescription) {
      setFormErrors((current) => ({
        ...current,
        description: "The combined report description must be 2,000 characters or fewer",
      }))
      return
    }

    await saveReport(submissionDescription)
  }

  const saveReport = async (submissionDescription: string) => {
    if (!user || !authenticatedUser?.district) {
      toast({
        title: "Session Required",
        description: "Please sign in again before submitting a report.",
        variant: "destructive",
      })
      return
    }

    const operation = operationGateRef.current.begin()
    if (!operation) return
    setLoading(true)
    try {
      const reportRequest = {
          category: selectedIssueType,
          description: submissionDescription,
          districtId: selectedDistrictId,
          location: { lat: selectedLat!, lng: selectedLng! },
        }
      const result = await submitReportWithOptionalImage({
        existingReportId: createdReportId,
        report: reportRequest,
        image: selectedPhotoFile,
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
          title: "Report Not Submitted",
          description: reportClientErrorMessage(error),
          variant: "destructive",
        })
      }
    } finally {
      if (operationGateRef.current.finish(operation)) setLoading(false)
    }
  }

  return (
    <>
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>

      {showMap && (
        <MapSelectorModal
          onClose={() => setShowMap(false)}
          onSelect={(lat, lng, district) => {
            setSelectedLat(lat)
            setSelectedLng(lng)
            setSelectedDistrictName(district)
            setSelectedDistrictId(findDistrictByName(district)?.id ?? "")
            setShowMap(false)
            setFormErrors((prev) => ({
              ...prev,
              location: findDistrictByName(district) ? undefined : "Please select a supported Jeddah district",
            }))
          }}
        />
      )}

      <Dialog open={true} onOpenChange={(open) => { if (!open && !loading) onClose() }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto bg-[#F5F7F5] p-0">
          <DialogHeader className="sticky top-0 bg-[#F5F7F5] z-10 px-6 pt-6 pb-4 border-b border-[#1B4D3E]/10">
            <DialogTitle className="text-xl font-serif text-[#1B4D3E]">Report an Issue</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Help us keep Jari clean and safe</p>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-6 pt-4">
            {/* LOCATION BOX */}
            <div
              className={`bg-white rounded-xl p-4 border shadow-sm ${formErrors.location ? "border-red-500 border-2 shake" : "border-[#1B4D3E]/10"}`}
            >
              <p className="text-sm font-semibold text-[#1B4D3E]">Selected Location</p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedDistrictName
                  ? `${selectedDistrictName} (${selectedLat?.toFixed(4)}, ${selectedLng?.toFixed(4)})`
                  : "No location selected"}
              </p>

              <Button onClick={() => setShowMap(true)} className="mt-3 w-full bg-primary text-white rounded-xl">
                <MapPin className="mr-2" /> Select Location on Map
              </Button>

              {formErrors.location && <p className="text-red-500 text-sm mt-2">{formErrors.location}</p>}
            </div>

            {/* ISSUE TYPES */}
            <div className={formErrors.issueType ? "shake" : ""}>
              <label className="text-sm font-semibold text-[#1B4D3E] mb-3 block">What&apos;s the issue?</label>
              <div
                className={`grid grid-cols-2 gap-3 p-3 rounded-xl ${formErrors.issueType ? "border-2 border-red-500" : ""}`}
              >
                {issueTypes.map((type) => {
                  const IconComponent = type.icon
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => {
                        setSelectedIssueType(type.id)
                        setFormErrors((prev) => ({ ...prev, issueType: undefined }))
                      }}
                      className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 min-h-[90px] ${
                        selectedIssueType === type.id
                          ? "border-[#1B4D3E] bg-[#1B4D3E]/5 text-[#1B4D3E]"
                          : "border-transparent bg-white text-muted-foreground hover:bg-gray-50"
                      }`}
                    >
                      <IconComponent className="h-6 w-6" />
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  )
                })}
              </div>

              {formErrors.issueType && <p className="text-red-500 text-sm mt-2">{formErrors.issueType}</p>}

              {selectedIssueType === "other" && (
                <div>
                  <label className="text-sm font-semibold text-[#1B4D3E] mb-2 block">Specify the Issue</label>
                  <Input
                    value={otherDescription}
                    onChange={(e) => {
                      setOtherDescription(e.target.value)
                      if (e.target.value.trim()) {
                        setFormErrors((current) => ({ ...current, otherDescription: undefined }))
                      }
                    }}
                    placeholder="e.g. Broken Bench, Graffiti..."
                    className={`bg-white border rounded-xl ${formErrors.otherDescription ? "border-red-500 border-2" : ""}`}
                  />
                  {formErrors.otherDescription && (
                    <p className="text-red-500 text-sm mt-2">{formErrors.otherDescription}</p>
                  )}
                </div>
              )}
            </div>

            {/* PHOTO */}
            <div>
              <label className="text-sm font-semibold text-[#1B4D3E] mb-2 block">Add Photo (Optional)</label>
              <div className="relative">
                <label
                  htmlFor="imageUpload"
                  className={`w-full border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition h-[180px] overflow-hidden ${
                    uploadedPhoto ? "border-transparent p-0" : "border-gray-400 hover:border-[#1B4D3E] p-6"
                  }`}
                >
                  {uploadedPhoto ? (
                    <>
                      <Image
                        src={uploadedPhoto || "/placeholder.svg"}
                        alt="Uploaded preview"
                        width={800}
                        height={360}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-12 w-12 text-[#6B7280] mb-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-gray-600 font-medium">Upload an image</span>
                      <span className="text-gray-400 text-sm">(Optional)</span>
                    </div>
                  )}
                  <input
                    id="imageUpload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && selectPhoto(e.target.files[0])}
                  />
                </label>
                {uploadedPhoto && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      if (uploadedPhoto.startsWith("blob:")) URL.revokeObjectURL(uploadedPhoto)
                      setUploadedPhoto(null)
                      setSelectedPhotoFile(null)
                      setImageUploadError(null)
                    }}
                    className="absolute top-2 right-2 bg-white rounded-full p-2 shadow-md hover:shadow-lg transition-shadow"
                    aria-label="Remove image"
                  >
                    <Trash2 className="h-[18px] w-[18px] text-gray-700" />
                  </button>
                )}
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className={formErrors.description ? "shake" : ""}>
              <label className="text-sm font-semibold text-[#1B4D3E] mb-2 block">Describe the problem</label>
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  if (e.target.value.trim()) {
                    setFormErrors((prev) => ({ ...prev, description: undefined }))
                  }
                }}
                placeholder="Tell us more about what you see..."
                className={`resize-none bg-white border rounded-xl min-h-[100px] ${formErrors.description ? "border-red-500 border-2" : ""}`}
                rows={4}
              />

              {formErrors.description && <p className="text-red-500 text-sm mt-2">{formErrors.description}</p>}
            </div>

            {/* SUBMIT */}
            {imageUploadError && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                <p>{imageUploadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={loading}
                  onClick={() => createdReportId && router.push(reportSuccessPath(createdReportId))}
                >
                  Continue without image
                </Button>
              </div>
            )}
            <Button
              onClick={handleSubmit}
              className="w-full bg-[#1B4D3E] hover:bg-[#1B4D3E]/90 text-white rounded-xl h-12 text-base font-semibold shadow-sm"
              disabled={loading || isCreatingReport}
            >
              {loading
                ? createdReportId ? "Uploading Image..." : "Submitting..."
                : createdReportId ? "Retry Image Upload" : "Submit Report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
