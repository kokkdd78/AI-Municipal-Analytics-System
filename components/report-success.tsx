"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CheckCircle2, RefreshCw } from "lucide-react"
import Image from "next/image"
import AuthenticatedRoleBoundary from "./authenticated-role-boundary"
import { getReportDetail, ReportClientError, reportClientErrorMessage } from "@/lib/reports/client"
import type { ReportDetailDto } from "@/lib/reports/dto"

interface ReportSuccessProps {
  reportId?: string
}

export default function ReportSuccess({ reportId: propReportId }: ReportSuccessProps) {
  return (
    <AuthenticatedRoleBoundary role="Citizen">
      <ReportSuccessContent reportId={propReportId} />
    </AuthenticatedRoleBoundary>
  )
}

function ReportSuccessContent({ reportId: propReportId }: ReportSuccessProps) {
  const router = useRouter()
  const reportId = propReportId
  const [verifiedReportId, setVerifiedReportId] = useState<string | null>(null)
  const [report, setReport] = useState<ReportDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!reportId) return

    const controller = new AbortController()
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setVerifiedReportId(null)
      setReport(null)
      setError(null)
      void getReportDetail(reportId, { signal: controller.signal })
        .then((loadedReport) => {
          if (!controller.signal.aborted) {
            setReport(loadedReport)
            setVerifiedReportId(reportId)
          }
        })
        .catch((requestError) => {
          if (!(requestError instanceof ReportClientError && requestError.kind === "aborted")) {
            setError(reportClientErrorMessage(requestError))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [reportId, retry])

  const verified = Boolean(reportId && verifiedReportId === reportId)

  useEffect(() => {
    if (!reportId || !verified) return

    const timer = setTimeout(() => {
      router.push(`/report/track/${reportId}`)
    }, 2000)

    return () => clearTimeout(timer)
  }, [reportId, router, verified])

  const handleViewNow = () => {
    if (reportId && verified) {
      router.push(`/report/track/${reportId}`)
    }
  }

  if (!reportId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center" role="alert">
        <p className="mb-4 text-destructive">The submitted report ID is missing.</p>
        <Button onClick={() => router.replace("/citizen-app")}>Return home</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6" role="status">
        <RefreshCw className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Confirming your submitted report…</p>
      </div>
    )
  }

  if (error || !verified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center" role="alert">
        <p className="mb-4 text-destructive">{error ?? "The report could not be confirmed."}</p>
        <Button onClick={() => setRetry((value) => value + 1)}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <CheckCircle2 className="w-24 h-24 text-green-500 animate-bounce" />
        </div>

        {report?.attachments[0] && (
          <Image
            src={report.attachments[0].url}
            alt={report.attachments[0].name}
            width={800}
            height={480}
            unoptimized
            className="h-52 w-full rounded-xl object-cover"
          />
        )}

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
