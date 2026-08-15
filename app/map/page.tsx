import MapClient from "./map-client"
import { requirePageRole } from "@/lib/auth/page-authorization"

export default async function MapPage() {
  await requirePageRole("Citizen")
  return <MapClient />
}
