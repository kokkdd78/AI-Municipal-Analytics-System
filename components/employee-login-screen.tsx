"use client"

import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Briefcase } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/auth-context"
import { loginStaff, municipalAuthFailureMessage } from "@/lib/auth/client"

interface EmployeeLoginScreenProps {
  onBack: () => void
}

export default function EmployeeLoginScreen({ onBack }: EmployeeLoginScreenProps) {
  const router = useRouter()
  const { completeAuthentication, isLoading } = useAuth()
  const [employeeId, setEmployeeId] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionRef = useRef(false)

  const handleEmployeeLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting || submissionRef.current) return
    if (!employeeId.trim() || !password) {
      setError("Enter your employee ID and password.")
      return
    }

    setError(null)
    submissionRef.current = true
    setIsSubmitting(true)
    const result = await loginStaff({ employeeId, password })
    if (!result.ok) {
      setError(municipalAuthFailureMessage(result))
      submissionRef.current = false
      setIsSubmitting(false)
      return
    }

    const confirmed = await completeAuthentication(result.data)
    if (!confirmed.ok) {
      setError(municipalAuthFailureMessage(confirmed))
      submissionRef.current = false
      setIsSubmitting(false)
      return
    }

    router.replace(confirmed.data.destination)
    router.refresh()
  }

  const handleBack = () => {
    if (isSubmitting || submissionRef.current) return
    onBack()
  }

  return (
    <div className="min-h-screen flex bg-[#F5F7F5]">
      <div className="hidden md:flex md:w-1/2 bg-[#1B4D3E] flex-col items-center justify-center text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('/placeholder.jpg')] bg-cover bg-center mix-blend-overlay" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="h-24 w-24 bg-white/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-sm border border-white/20">
            <Briefcase className="h-12 w-12 text-white" />
          </div>
          <h1 className="text-5xl font-serif text-center leading-tight mb-6">Jari</h1>
          <p className="text-white/80 text-xl text-center max-w-md font-light leading-relaxed">
            Employee Portal - Secure access for city management and field operations.
          </p>
        </div>
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-serif text-[#1B4D3E] mb-2">Employee Sign In</h2>
            <p className="text-muted-foreground">Enter your municipal employee credentials</p>
          </div>

          <form className="space-y-6" onSubmit={handleEmployeeLogin}>
            <div className="space-y-2">
              <label htmlFor="employee-id" className="text-sm font-medium text-[#1B4D3E]">Employee ID</label>
              <Input
                id="employee-id"
                type="text"
                autoComplete="username"
                placeholder="e.g. M-1024 or C-402"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                disabled={isSubmitting}
                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="employee-password" className="text-sm font-medium text-[#1B4D3E]">Password</label>
              <Input
                id="employee-password"
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
              {isSubmitting ? "Signing In..." : "Access Dashboard"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#F5F7F5] px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={isSubmitting}
              className="w-full h-12 border-[#1B4D3E] text-[#1B4D3E] hover:bg-[#1B4D3E]/5"
            >
              Back to Citizen Login
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
