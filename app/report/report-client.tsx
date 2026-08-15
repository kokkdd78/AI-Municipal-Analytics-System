"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { DuplicateDetectionModal } from "@/components/duplicate-detection-modal"
import { X, MapPin, Trash2, Lightbulb, AlertCircle, Camera } from "lucide-react"
import Image from "next/image"
import AuthenticatedRoleBoundary from "@/components/authenticated-role-boundary"

export default function ReportPage() {
  return (
    <AuthenticatedRoleBoundary role="Citizen">
      <ReportPageContent />
    </AuthenticatedRoleBoundary>
  )
}

function ReportPageContent() {
  const { toast } = useToast()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  const issueTypes = [
    { id: "pothole", label: "Pothole", icon: AlertCircle },
    { id: "light", label: "Broken Light", icon: Lightbulb },
    { id: "trash", label: "Trash", icon: Trash2 },
    { id: "other", label: "Other", icon: AlertCircle },
  ]

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = () => {
    if (!selectedType || !description.trim()) {
      toast({
        title: "Incomplete Form",
        description: "Please select an issue type and add a description.",
        variant: "destructive",
      })
      return
    }

    setShowDuplicateModal(true)
  }

  const handleUpvoteExisting = () => {
    setShowDuplicateModal(false)
    toast({
      title: "Success!",
      description: "Your upvote has been added to the existing report.",
    })
    setSelectedType(null)
    setDescription("")
    setUploadedImage(null)
  }

  const handleSubmitAsNew = () => {
    setShowDuplicateModal(false)
    toast({
      title: "Report Submitted!",
      description: "Thank you for reporting this issue. We'll investigate shortly.",
    })
    setSelectedType(null)
    setDescription("")
    setUploadedImage(null)
  }

  return (
    <div className="h-screen bg-background flex flex-col pb-8">
      {/* Header */}
      <div className="px-6 pt-4 pb-4 bg-card border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Report an Issue</h1>
        <Link href="/citizen-app">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-6 w-6" />
          </button>
        </Link>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Location Preview */}
        <div className="mb-8">
          <label className="text-sm font-semibold text-foreground mb-2 block">Selected Location</label>
          <Card className="p-4 bg-slate-100 border border-border rounded-lg overflow-hidden relative h-32">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
              <MapPin className="h-8 w-8 text-primary" />
            </div>
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
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="image-upload" />
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
                </div>
              ) : (
                <>
                  <Camera className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">Click or drag photo here</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, and GIF</p>
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
        <Button
          onClick={handleSubmit}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 rounded-lg"
        >
          Submit Report
        </Button>
      </div>

      <DuplicateDetectionModal
        open={showDuplicateModal}
        photoUrl={uploadedImage}
        description={description}
        issueType={selectedType}
        lat={21.5433}
        lng={39.1728}
        district="Jeddah"
        onClose={() => setShowDuplicateModal(false)}
        onConfirmDuplicate={handleUpvoteExisting}
        onSubmitNew={handleSubmitAsNew}
      />
    </div>
  )
}
