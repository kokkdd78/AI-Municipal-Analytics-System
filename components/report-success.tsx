"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CheckCircle2 } from "lucide-react"

interface ReportSuccessProps {
  reportId?: string
}

export default function ReportSuccess({ reportId: propReportId }: ReportSuccessProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reportId = propReportId || searchParams.get("reportId")

  useEffect(() => {
    if (!reportId) return

    // Auto-redirect after 2 seconds
    const timer = setTimeout(() => {
      router.push(`/report/track/${reportId}`)
    }, 2000)

    return () => clearTimeout(timer)
  }, [reportId, router])

  const handleViewNow = () => {
    if (reportId) {
      router.push(`/report/track/${reportId}`)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <CheckCircle2 className="w-24 h-24 text-green-500 animate-bounce" />
        </div>

        {/* Main Text */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-foreground">Report submitted successfully</h1>
          <p className="text-muted-foreground">You will be redirected to the report tracking page in 2 seconds</p>
        </div>

        {/* Button */}
        <Button
          onClick={handleViewNow}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-base font-semibold rounded-xl"
        >
          View report tracking now
        </Button>
      </div>
    </div>
  )
}
