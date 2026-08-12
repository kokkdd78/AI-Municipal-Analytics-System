"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/auth-context"
import { Briefcase } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import SignUpScreen from "./sign-up-screen"
import EmployeeLoginScreen from "./employee-login-screen"

import { OnboardingCarousel } from "./onboarding-carousel"

import { useRouter } from "next/navigation"

interface LoginScreenProps {
  initialMode?: string
}

export default function LoginScreen({ initialMode }: LoginScreenProps) {
  const router = useRouter()

  const { setUserRole } = useAuth()
  const [phone, setPhone] = useState("+966")
  const [password, setPassword] = useState("")
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otp, setOtp] = useState("")
  const [showEmployeeLogin, setShowEmployeeLogin] = useState(false)
  const [showSignUp, setShowSignUp] = useState<boolean>(initialMode === "signup")

  const handleCitizenLogin = () => {
    if (phone && password) {
      setShowOtpModal(true)
    }
  }

  const handleOtpSubmit = () => {
    if (otp.length === 4) {
      // In a real app, we would fetch user data here.
      // For now, we assume the user is already in DataContext or we just set the role.
      // If we wanted to simulate "logging in" as a specific user, we'd need a user database.
      setUserRole("Citizen")
      router.push("/")
    }
  }

  if (showSignUp) {
    return <SignUpScreen onBack={() => setShowSignUp(false)} />
  }

  if (showEmployeeLogin) {
    return <EmployeeLoginScreen onBack={() => setShowEmployeeLogin(false)} />
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F5F7F5]">
      {/* Left/Top Side - Onboarding Carousel */}
      <div className="w-full h-[40vh] md:h-auto md:w-1/2 bg-[#1B4D3E] relative overflow-hidden">
        <OnboardingCarousel />
      </div>

      {/* Right/Bottom Side - Login Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-serif text-[#1B4D3E] mb-2">Welcome Back</h2>
            <p className="text-muted-foreground">Sign in to connect with your community</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1B4D3E]">Phone Number</label>
              <Input
                type="tel"
                placeholder="+966 50 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1B4D3E]">Password</label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
              />
            </div>

            <Button
              onClick={handleCitizenLogin}
              className="w-full h-12 bg-[#1B4D3E] hover:bg-[#153D31] text-white text-lg font-medium rounded-lg transition-all duration-200 shadow-lg shadow-[#1B4D3E]/20"
            >
              Sign In
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <button onClick={() => setShowSignUp(true)} className="text-[#1B4D3E] font-medium hover:underline">
                Sign up
              </button>
            </p>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#F5F7F5] px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setShowEmployeeLogin(true)}
              className="w-full h-12 border-[#1B4D3E] text-[#1B4D3E] hover:bg-[#1B4D3E]/5 flex items-center justify-center gap-2"
            >
              <Briefcase className="h-4 w-4" />
              Login as Employee
            </Button>
          </div>
        </div>
      </div>

      {/* OTP Modal - Updated to 4 digits */}
      <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
        <DialogContent className="max-w-[90vw] sm:max-w-md bg-[#F5F7F5] border-none shadow-2xl mx-auto">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-serif text-[#1B4D3E]">Verify Your Identity</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Enter the 4-digit code sent to your phone number ending in {phone.slice(-4)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center space-y-6 py-6">
            <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
              <InputOTP maxLength={4} value={otp} onChange={(value) => setOtp(value)}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-14 w-14 border-gray-200 text-xl" />
                  <InputOTPSlot index={1} className="h-14 w-14 border-gray-200 text-xl" />
                  <InputOTPSlot index={2} className="h-14 w-14 border-gray-200 text-xl" />
                  <InputOTPSlot index={3} className="h-14 w-14 border-gray-200 text-xl" />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button
              onClick={handleOtpSubmit}
              disabled={otp.length !== 4}
              className="w-full h-12 bg-[#1B4D3E] hover:bg-[#153D31] text-white text-lg font-medium rounded-lg transition-all duration-200 shadow-lg shadow-[#1B4D3E]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Verify & Sign In
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Didn&apos;t receive the code? <button className="text-[#1B4D3E] font-medium hover:underline">Resend</button>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
