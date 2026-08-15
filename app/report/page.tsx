import ReportClient from "./report-client"
import { requirePageRole } from "@/lib/auth/page-authorization"

export default async function ReportPage() {
  await requirePageRole("Citizen")
  return <ReportClient />
}
