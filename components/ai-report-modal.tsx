"use client"

import { useEffect, useRef, useState } from "react"
import NextImage from "next/image"
import { Camera, MapPin, Sparkles, X } from "lucide-react"

import MapSelectorModal from "@/components/map-selector-modal"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useData } from "@/context/data-context"
import { useToast } from "@/hooks/use-toast"
import { requestReportAssistance } from "@/lib/report-assistance/client"
import type { ReportAssistanceResponse } from "@/lib/report-assistance/contracts"
import { applyAssistanceSuggestion, overrideAssistanceSuggestion } from "@/lib/report-assistance/draft"
import { ReportClientError, reportClientErrorMessage } from "@/lib/reports/client"
import {
  confirmedMapReportLocation,
  createReportFormOperationGate,
  INITIAL_EXPLICIT_REPORT_LOCATION,
  reportSuccessPath,
  submitReportWithOptionalImage,
  type ExplicitReportLocation,
} from "@/lib/reports/form-operation"
import { useRouter } from "next/navigation"

const categories = [
  ["pothole", "Pothole"], ["lighting", "Street Lighting"], ["trash", "Trash/Debris"],
  ["water", "Water Leak"], ["trees", "Trees"], ["other", "Other"],
] as const

interface AiReportModalProps { onClose: () => void }

export default function AiReportModal({ onClose }: AiReportModalProps) {
  const { toast } = useToast()
  const router = useRouter()
  const { createReport, uploadReportImage, isCreatingReport } = useData()
  const operationGate = useRef(createReportFormOperationGate())
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [category, setCategory] = useState<(typeof categories)[number][0]>("other")
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium")
  const [description, setDescription] = useState("")
  const [selectedLocation, setSelectedLocation] = useState<ExplicitReportLocation | null>(
    INITIAL_EXPLICIT_REPORT_LOCATION,
  )
  const [showMap, setShowMap] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [assistance, setAssistance] = useState<ReportAssistanceResponse | null>(null)

  useEffect(() => () => operationGate.current.dispose(), [])

  const chooseImage = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Unsupported image", description: "Choose a JPEG, PNG, or WebP image.", variant: "destructive" })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement("canvas")
        const scale = Math.min(1, 800 / Math.max(image.width, image.height))
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
        setUploadedPhoto(canvas.toDataURL("image/jpeg", 0.7))
        setSelectedFile(file)
        setAssistance(null)
      }
      image.onerror = () => toast({ title: "Image unavailable", description: "Choose a different image.", variant: "destructive" })
      image.src = typeof reader.result === "string" ? reader.result : ""
    }
    reader.onerror = () => toast({ title: "Image unavailable", description: "Choose a different image.", variant: "destructive" })
    reader.readAsDataURL(file)
  }

  const requestAssistance = async () => {
    if (!description.trim() || !selectedLocation || assisting || submitting) return
    setAssisting(true)
    try {
      const result = await requestReportAssistance({
        description: description.trim(),
        districtId: selectedLocation.districtId,
        location: { lat: selectedLocation.lat, lng: selectedLocation.lng },
        locationText: selectedLocation.districtName,
        ...(uploadedPhoto ? { image: { mimeType: "image/jpeg", dataUrl: uploadedPhoto } } : {}),
      })
      setAssistance(result)
      if (!result.available) {
        toast({ title: "AI unavailable", description: "You can complete the report manually." })
        return
      }
      const suggestion = applyAssistanceSuggestion({ category, severity }, result)
      setCategory(suggestion.category)
      setSeverity(suggestion.severity)
    } catch {
      toast({ title: "AI unavailable", description: "You can complete the report manually." })
      setAssistance({ available: false })
    } finally { setAssisting(false) }
  }

  const submit = async () => {
    if (!description.trim() || !selectedLocation || submitting || isCreatingReport) return
    const operation = operationGate.current.begin()
    if (!operation) return
    setSubmitting(true)
    try {
      const result = await submitReportWithOptionalImage({
        existingReportId: null,
        report: {
          category,
          severity,
          description: description.trim(),
          districtId: selectedLocation.districtId,
          location: { lat: selectedLocation.lat, lng: selectedLocation.lng },
        },
        image: selectedFile,
        signal: operation.signal,
        createReport: (request, signal) => createReport(request, { signal }),
        uploadImage: (reportId, image, signal) => uploadReportImage(reportId, image, { signal }),
      })
      if (result.image === "failed") {
        toast({ title: "Report saved", description: "The image upload failed; the report itself was saved.", variant: "destructive" })
        return
      }
      if (operationGate.current.commitNavigation(operation)) router.push(reportSuccessPath(result.reportId))
    } catch (error) {
      if (operationGate.current.isCurrent(operation) && !(error instanceof ReportClientError && error.kind === "aborted")) {
        toast({ title: "Report not submitted", description: reportClientErrorMessage(error), variant: "destructive" })
      }
    } finally { if (operationGate.current.finish(operation)) setSubmitting(false) }
  }

  const busy = assisting || submitting || isCreatingReport
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-[#1B4D3E]" />Quick Photo Report</DialogTitle></DialogHeader>
    {showMap && <MapSelectorModal onClose={() => setShowMap(false)} onSelect={(lat, lng, districtName, districtId) => {
      const location = confirmedMapReportLocation(lat, lng, districtName, districtId)
      if (!location) {
        toast({ title: "Unsupported location", description: "Choose a point within a supported Jeddah district.", variant: "destructive" })
        return
      }
      setSelectedLocation(location)
      setAssistance(null)
      setShowMap(false)
    }} />}
    <div className="space-y-4">
      {!uploadedPhoto ? <div className="border-2 border-dashed rounded-lg p-8 text-center border-primary/30 bg-primary/5"><Camera className="h-12 w-12 text-primary mx-auto mb-4" /><h3 className="text-lg font-semibold mb-2">Take a Photo</h3><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => event.target.files?.[0] && chooseImage(event.target.files[0])} className="hidden" id="ai-photo-upload" /><label htmlFor="ai-photo-upload"><Button asChild className="bg-[#1B4D3E] hover:bg-[#153D31]"><span>Open Camera</span></Button></label></div> : <div className="relative rounded-lg overflow-hidden"><NextImage src={uploadedPhoto} alt="Selected report" width={800} height={512} unoptimized className="w-full h-52 object-cover" /><button type="button" onClick={() => { setUploadedPhoto(null); setSelectedFile(null); setAssistance(null) }} className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full"><X className="h-4 w-4" /></button></div>}
      <div className="rounded-lg bg-slate-100 p-3"><p className="text-sm font-semibold">Report location</p><p className="text-xs text-muted-foreground">{selectedLocation ? `${selectedLocation.districtName} · ${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}` : "Choose and confirm a supported district on the map."}</p><Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy} onClick={() => setShowMap(true)}><MapPin className="mr-1 h-4 w-4" />Choose location</Button></div>
      <div className="space-y-2"><Label htmlFor="ai-description">Description</Label><Textarea id="ai-description" value={description} onChange={(event) => { setDescription(event.target.value); setAssistance(null) }} rows={4} placeholder="Describe the issue in detail" disabled={busy} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Category</Label><Select value={category} onValueChange={(value) => setCategory(overrideAssistanceSuggestion({ category, severity }, { category: value as typeof category }).category)} disabled={busy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Severity</Label><Select value={severity} onValueChange={(value) => setSeverity(overrideAssistanceSuggestion({ category, severity }, { severity: value as typeof severity }).severity)} disabled={busy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div></div>
      <Button type="button" variant="outline" className="w-full" disabled={busy || !description.trim() || !selectedLocation} onClick={() => void requestAssistance()}><Sparkles className="mr-2 h-4 w-4" />{assisting ? "Getting suggestions…" : "Get AI suggestions"}</Button>
      {assistance?.available && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><p><b>AI suggestion:</b> {assistance.suggestion.category} · {assistance.suggestion.severity}</p><p className="mt-1 text-muted-foreground">{assistance.suggestion.reasoning}</p>{assistance.possibleDuplicates.length > 0 && <div className="mt-2"><b>Possible duplicates</b>{assistance.possibleDuplicates.map((duplicate) => <p key={duplicate.id} className="mt-1 text-muted-foreground">{duplicate.title}: {duplicate.summary}</p>)}</div>}<p className="mt-2 text-xs text-muted-foreground">Suggestions are advisory. You may change the category, severity, and location before submitting.</p></div>}
      <Button type="button" className="w-full bg-[#1B4D3E] hover:bg-[#153D31]" disabled={busy || !description.trim() || !selectedLocation} onClick={() => void submit()}>{submitting ? "Submitting…" : "Submit report"}</Button>
    </div>
  </DialogContent></Dialog>
}
