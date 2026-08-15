"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Briefcase } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/auth-context"
import { loginCitizen, municipalAuthFailureMessage } from "@/lib/auth/client"
import { createAuthenticationOperationGate } from "@/lib/auth/form-operation"
import EmployeeLoginScreen from "./employee-login-screen"
import { OnboardingCarousel } from "./onboarding-carousel"
import SignUpScreen from "./sign-up-screen"

interface LoginScreenProps {
  initialMode?: string
}

export default function LoginScreen({ initialMode }: LoginScreenProps) {
  const router = useRouter()
  const { completeAuthentication, isLoading } = useAuth()
  const [phone, setPhone] = useState("+966")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionRef = useRef(false)
  const [operationGate] = useState(createAuthenticationOperationGate)
  const [isAuthenticationPending, setIsAuthenticationPending] = useState(false)
  const [showEmployeeLogin, setShowEmployeeLogin] = useState(false)
  const [showSignUp, setShowSignUp] = useState<boolean>(initialMode === "signup")

  useEffect(() => () => operationGate.dispose(), [operationGate])

  const handleCitizenLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting || submissionRef.current) return
    if (!phone.trim() || !password) {
      setError("Enter your phone number and password.")
      return
    }

    const operationToken = operationGate.begin("citizen-login")
    if (!operationToken) return

    setError(null)
    submissionRef.current = true
    setIsSubmitting(true)
    setIsAuthenticationPending(true)
    let navigationCommitted = false

    try {
      const result = await loginCitizen({ phone, password }, { signal: operationToken.signal })
      if (!operationGate.isCurrent(operationToken)) return
      if (!result.ok) {
        setError(municipalAuthFailureMessage(result))
        return
      }

      const confirmed = await completeAuthentication(result.data)
      if (!operationGate.isCurrent(operationToken)) return
      if (!confirmed.ok) {
        setError(municipalAuthFailureMessage(confirmed))
        return
      }

      navigationCommitted = operationGate.commitNavigation(operationToken)
      if (!navigationCommitted) return
      router.replace(confirmed.data.destination)
      router.refresh()
    } finally {
      if (operationGate.finish(operationToken) && !navigationCommitted) {
        submissionRef.current = false
        setIsSubmitting(false)
        setIsAuthenticationPending(false)
      }
    }
  }

  const showCitizenRegistration = () => {
    if (!operationGate.canSwitchMode()) return
    setShowSignUp(true)
  }

  const showStaffLogin = () => {
    if (!operationGate.canSwitchMode()) return
    setShowEmployeeLogin(true)
  }

  const showCitizenLogin = () => {
    if (!operationGate.canSwitchMode()) return
    setShowSignUp(false)
  }

  if (showSignUp) {
    return (
      <SignUpScreen
        isAuthenticationPending={isAuthenticationPending}
        onAuthenticationPendingChange={setIsAuthenticationPending}
        onBack={showCitizenLogin}
        operationGate={operationGate}
      />
    )
  }
  if (showEmployeeLogin) return <EmployeeLoginScreen onBack={() => setShowEmployeeLogin(false)} />

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F5F7F5]">
      <div className="w-full h-[40vh] md:h-auto md:w-1/2 bg-[#1B4D3E] relative overflow-hidden">
        <OnboardingCarousel />
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-serif text-[#1B4D3E] mb-2">Welcome Back</h2>
            <p className="text-muted-foreground">Sign in to connect with your community</p>
          </div>

          <form className="space-y-6" onSubmit={handleCitizenLogin}>
            <div className="space-y-2">
              <label htmlFor="citizen-phone" className="text-sm font-medium text-[#1B4D3E]">
                Phone Number
              </label>
              <Input
                id="citizen-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+966 50 123 4567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={isSubmitting}
                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="citizen-password" className="text-sm font-medium text-[#1B4D3E]">
                Password
              </label>
              <Input
                id="citizen-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
              />
            </div>

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

            <Button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full h-12 bg-[#1B4D3E] hover:bg-[#153D31] text-white text-lg font-medium rounded-lg transition-all duration-200 shadow-lg shadow-[#1B4D3E]/20"
            >
              {isSubmitting ? "Signing In..." : "Sign In"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={showCitizenRegistration}
                disabled={isSubmitting || isAuthenticationPending}
                className="text-[#1B4D3E] font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sign up
              </button>
            </p>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#F5F7F5] px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={showStaffLogin}
              disabled={isSubmitting || isAuthenticationPending}
              className="w-full h-12 border-[#1B4D3E] text-[#1B4D3E] hover:bg-[#1B4D3E]/5 flex items-center justify-center gap-2"
            >
              <Briefcase className="h-4 w-4" />
              Login as Employee
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
