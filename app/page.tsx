"use client"

import { useAuth } from "@/context/auth-context"
import LoginScreen from "@/components/login-screen"
import CitizenApp from "@/components/citizen-app"
import ManagerDashboard from "@/components/manager-dashboard"
import CrewTaskList from "@/components/crew-task-list"
import OnboardingWalkthrough from "@/components/onboarding-walkthrough"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const { userRole, isLoading } = useAuth()
  const router = useRouter()

  const handleGetStarted = () => {
    router.push("/auth?mode=signup")
  }

  if (isLoading) {
    return null
  }

  if (userRole === "Citizen") {
    return <CitizenApp />
  }

  if (userRole === "Manager") {
    return <ManagerDashboard />
  }

  if (userRole === "Crew") {
    return <CrewTaskList />
  }

  return <OnboardingWalkthrough onGetStarted={handleGetStarted} />
}
