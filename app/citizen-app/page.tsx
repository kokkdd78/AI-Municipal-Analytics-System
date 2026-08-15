import CitizenApp from "@/components/citizen-app"
import { requirePageRole } from "@/lib/auth/page-authorization"

export default async function CitizenAppPage() {
  await requirePageRole("Citizen")
  return <CitizenApp />
}
