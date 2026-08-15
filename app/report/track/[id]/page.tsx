import ReportTrackingClient from "./report-tracking-client"
import { requirePageRole } from "@/lib/auth/page-authorization"

export default async function ReportTrackingPage() {
  await requirePageRole("Citizen")
  return <ReportTrackingClient />
}
