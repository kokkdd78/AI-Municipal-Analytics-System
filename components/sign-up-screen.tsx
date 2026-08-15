"use client"

import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Building2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { JEDDAH_DISTRICTS } from "@/constants/districts"
import { useAuth } from "@/context/auth-context"
import { municipalAuthFailureMessage, registerCitizen } from "@/lib/auth/client"
import type { AuthenticationOperationGate } from "@/lib/auth/form-operation"

interface SignUpScreenProps {
  isAuthenticationPending: boolean
  onAuthenticationPendingChange: (pending: boolean) => void
  onBack: () => void
  operationGate: AuthenticationOperationGate
}

export default function SignUpScreen({
  isAuthenticationPending,
  onAuthenticationPendingChange,
  onBack,
  operationGate,
}: SignUpScreenProps) {
  const router = useRouter()
  const { completeAuthentication, isLoading } = useAuth()
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("+966")
  const [districtId, setDistrictId] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionRef = useRef(false)

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting || submissionRef.current) return

    if (fullName.trim().length < 2 || !phone.trim() || !districtId) {
      setError("Complete your name, phone number, and district.")
      return
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    const operationToken = operationGate.begin("citizen-register")
    if (!operationToken) return

    setError(null)
    submissionRef.current = true
    setIsSubmitting(true)
    onAuthenticationPendingChange(true)
    let navigationCommitted = false

    try {
      const result = await registerCitizen(
        {
          name: fullName.trim(),
          phone,
          districtId,
          password,
          confirmPassword,
        },
        { signal: operationToken.signal },
      )
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
        onAuthenticationPendingChange(false)
      }
    }
  }

  const handleBack = () => {
    if (!operationGate.canSwitchMode()) return
    onBack()
  }

  return (
    <div className="min-h-screen flex bg-[#F5F7F5]">
      <div className="hidden md:flex md:w-1/2 bg-[#1B4D3E] flex-col items-center justify-center text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('/placeholder.jpg')] bg-cover bg-center mix-blend-overlay" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="h-24 w-24 bg-white/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-sm border border-white/20">
            <Building2 className="h-12 w-12 text-white" />
          </div>
          <h1 className="text-5xl font-serif text-center leading-tight mb-6">Jari</h1>
          <p className="text-white/80 text-xl text-center max-w-md font-light leading-relaxed">
            Join your community in making our city better, together.
          </p>
        </div>
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-serif text-[#1B4D3E] mb-2">Create Account</h2>
            <p className="text-muted-foreground">Join Jari to start making a difference</p>
          </div>

          <form className="space-y-4" onSubmit={handleSignUp}>
            <div className="space-y-2">
              <label htmlFor="registration-name" className="text-sm font-medium text-[#1B4D3E]">Full Name</label>
              <Input
                id="registration-name"
                type="text"
                autoComplete="name"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={isSubmitting}
                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="registration-phone" className="text-sm font-medium text-[#1B4D3E]">Phone Number</label>
              <Input
                id="registration-phone"
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
              <label className="text-sm font-medium text-[#1B4D3E]">Select District</label>
              <Select value={districtId} onValueChange={setDistrictId} disabled={isSubmitting}>
                <SelectTrigger className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20">
                  <SelectValue placeholder="Choose your district" />
                </SelectTrigger>
                <SelectContent>
                  {JEDDAH_DISTRICTS.map((district) => (
                    <SelectItem key={district.id} value={district.id}>{district.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="registration-password" className="text-sm font-medium text-[#1B4D3E]">Password</label>
              <Input
                id="registration-password"
                type="password"
                autoComplete="new-password"
                placeholder="Create a password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="registration-confirm-password" className="text-sm font-medium text-[#1B4D3E]">Confirm Password</label>
              <Input
                id="registration-confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
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
              {isSubmitting ? "Creating Account..." : "Sign Up"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting || isAuthenticationPending}
                className="text-[#1B4D3E] font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sign in
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
