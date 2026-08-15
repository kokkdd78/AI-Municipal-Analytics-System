import MyReportsClient from "./my-reports-client"
import { requirePageRole } from "@/lib/auth/page-authorization"

export default async function MyReportsPage() {
  await requirePageRole("Citizen")
  return <MyReportsClient />
}
