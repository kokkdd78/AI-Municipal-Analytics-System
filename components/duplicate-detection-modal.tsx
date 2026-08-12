"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle } from "lucide-react"

interface DuplicateDetectionModalProps {
  photoUrl: string | null
  description: string
  issueType: string | null
  lat: number
  lng: number
  district: string
  onClose: () => void
  onConfirmDuplicate: () => void
  onSubmitNew: () => void
}

export function DuplicateDetectionModal({
  photoUrl,
  description,
  issueType,
  lat,
  lng,
  district,
  onClose,
  onConfirmDuplicate,
  onSubmitNew,
}: DuplicateDetectionModalProps) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl">
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0" />
          <h2 className="text-lg font-bold text-foreground">Similar Issue Found Nearby</h2>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Existing Report */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Found Nearby</p>
              <div className="bg-slate-100 rounded-lg overflow-hidden h-28 flex items-center justify-center">
                <img src="/pothole.png" alt="Existing report" className="w-full h-full object-cover" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Pothole on Main St</p>
                <div className="inline-block px-2 py-1 bg-blue-100 rounded text-xs font-medium text-blue-700">
                  In Progress
                </div>
              </div>
            </div>

            {/* Your Draft */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Draft</p>
              <div className="bg-slate-100 rounded-lg overflow-hidden h-28 flex items-center justify-center">
                {photoUrl ? (
                  <img src={photoUrl || "/placeholder.svg"} alt="Your report" className="w-full h-full object-cover" />
                ) : (
                  <img src="/issue.jpg" alt="Placeholder" className="w-full h-full object-cover" />
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground line-clamp-2">{description || "No description"}</p>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-3 pt-2">
            <Button
              onClick={onConfirmDuplicate}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 rounded-lg"
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              Yes, Upvote Existing Report
            </Button>

            <Button
              onClick={onSubmitNew}
              variant="outline"
              className="w-full border-border text-foreground hover:bg-accent font-medium h-10 rounded-lg bg-transparent"
            >
              No, Submit as New Report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DuplicateDetectionModal
