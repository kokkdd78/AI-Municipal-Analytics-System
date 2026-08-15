import { redirect } from "next/navigation"

import OnboardingWalkthrough from "@/components/onboarding-walkthrough"
import { getCurrentUser } from "@/lib/auth/authorization"
import { roleHome } from "@/lib/auth/route-policy"

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) redirect(roleHome(user.role))
  return <OnboardingWalkthrough />
}
