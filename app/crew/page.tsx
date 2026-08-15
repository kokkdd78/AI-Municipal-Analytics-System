import CrewTaskList from "@/components/crew-task-list"
import { requirePageRole } from "@/lib/auth/page-authorization"

export default async function CrewPage() {
  await requirePageRole("Crew")
  return <CrewTaskList />
}
