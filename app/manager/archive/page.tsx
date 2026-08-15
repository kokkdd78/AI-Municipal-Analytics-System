import ArchiveScreen from "@/components/archive-screen"
import { requirePageRole } from "@/lib/auth/page-authorization"

export default async function ManagerArchivePage() {
  await requirePageRole("Manager")
  return <ArchiveScreen />
}
