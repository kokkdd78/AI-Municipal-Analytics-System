import ManagerDashboard from "@/components/manager-dashboard"
import { requirePageRole } from "@/lib/auth/page-authorization"

export default async function ManagerPage() {
  await requirePageRole("Manager")
  return <ManagerDashboard />
}
