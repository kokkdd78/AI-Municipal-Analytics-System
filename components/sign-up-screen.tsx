"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Building2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { useData } from "@/context/data-context"
import { useAuth } from "@/context/auth-context"

interface SignUpScreenProps {
    onBack: () => void
}

export default function SignUpScreen({ onBack }: SignUpScreenProps) {
    const router = useRouter()
    const { setUserRole, setUserData } = useAuth()
    const { updateUser } = useData()
    const [signUpFullName, setSignUpFullName] = useState("")
    const [signUpPhone, setSignUpPhone] = useState("+966")
    const [signUpDistrict, setSignUpDistrict] = useState("")
    const [signUpPassword, setSignUpPassword] = useState("")
    const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("")
    const [showSignUpOtp, setShowSignUpOtp] = useState(false)
    const [signUpOtp, setSignUpOtp] = useState("")

    const handleSignUp = () => {
        if (signUpFullName && signUpPhone && signUpDistrict && signUpPassword && signUpConfirmPassword) {
            if (signUpPassword !== signUpConfirmPassword) {
                alert("Passwords do not match")
                return
            }
            setShowSignUpOtp(true)
        }
    }

    const handleSignUpOtpSubmit = () => {
        if (signUpOtp.length === 4) {
            const newUserData = {
                fullName: signUpFullName,
                phone: signUpPhone,
                district: signUpDistrict,
            }
            setUserData(newUserData)
            updateUser({
                name: signUpFullName,
                district: signUpDistrict,
                role: "citizen"
            })
            setUserRole("Citizen")
            router.push("/")
        }
    }

    return (
        <div className="min-h-screen flex bg-[#F5F7F5]">
            {/* Left Side - Brand */}
            <div className="hidden md:flex md:w-1/2 bg-[#1B4D3E] flex-col items-center justify-center text-white p-12 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[url('/images/attachments-gen-images-public-sidewalk.jpg')] bg-cover bg-center mix-blend-overlay"></div>
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

            {/* Right Side - Sign Up Form */}
            <div className="w-full md:w-1/2 flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h2 className="text-3xl font-serif text-[#1B4D3E] mb-2">Create Account</h2>
                        <p className="text-muted-foreground">Join Jari to start making a difference</p>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#1B4D3E]">Full Name</label>
                            <Input
                                type="text"
                                placeholder="Enter your full name"
                                value={signUpFullName}
                                onChange={(e) => setSignUpFullName(e.target.value)}
                                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#1B4D3E]">Phone Number</label>
                            <Input
                                type="tel"
                                placeholder="+966 50 123 4567"
                                value={signUpPhone}
                                onChange={(e) => setSignUpPhone(e.target.value)}
                                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#1B4D3E]">Select District</label>
                            <Select value={signUpDistrict} onValueChange={setSignUpDistrict}>
                                <SelectTrigger className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20">
                                    <SelectValue placeholder="Choose your district" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="al-naeem">Al-Naeem</SelectItem>
                                    <SelectItem value="al-malqa">Al-Malqa</SelectItem>
                                    <SelectItem value="al-olaya">Al-Olaya</SelectItem>
                                    <SelectItem value="al-sahafa">Al-Sahafa</SelectItem>
                                    <SelectItem value="al-rawdah">Al-Rawdah</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#1B4D3E]">Password</label>
                            <Input
                                type="password"
                                placeholder="Create a password"
                                value={signUpPassword}
                                onChange={(e) => setSignUpPassword(e.target.value)}
                                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#1B4D3E]">Confirm Password</label>
                            <Input
                                type="password"
                                placeholder="Confirm your password"
                                value={signUpConfirmPassword}
                                onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
                            />
                        </div>

                        <Button
                            onClick={handleSignUp}
                            className="w-full h-12 bg-[#1B4D3E] hover:bg-[#153D31] text-white text-lg font-medium rounded-lg transition-all duration-200 shadow-lg shadow-[#1B4D3E]/20"
                        >
                            Sign Up
                        </Button>

                        <p className="text-center text-sm text-muted-foreground">
                            Already have an account?{" "}
                            <button onClick={onBack} className="text-[#1B4D3E] font-medium hover:underline">
                                Sign in
                            </button>
                        </p>
                    </div>
                </div>
            </div>

            {/* Sign Up OTP Modal */}
            <Dialog open={showSignUpOtp} onOpenChange={setShowSignUpOtp}>
                <DialogContent className="sm:max-w-md bg-[#F5F7F5] border-none shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-center text-2xl font-serif text-[#1B4D3E]">Verify Your Phone</DialogTitle>
                        <DialogDescription className="text-center text-muted-foreground">
                            Enter the 4-digit code sent to {signUpPhone.slice(-4)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col items-center justify-center space-y-6 py-6">
                        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                            <InputOTP maxLength={4} value={signUpOtp} onChange={(value) => setSignUpOtp(value)}>
                                <InputOTPGroup>
                                    <InputOTPSlot index={0} className="h-14 w-14 border-gray-200 text-xl" />
                                    <InputOTPSlot index={1} className="h-14 w-14 border-gray-200 text-xl" />
                                    <InputOTPSlot index={2} className="h-14 w-14 border-gray-200 text-xl" />
                                    <InputOTPSlot index={3} className="h-14 w-14 border-gray-200 text-xl" />
                                </InputOTPGroup>
                            </InputOTP>
                        </div>
                        <Button
                            onClick={handleSignUpOtpSubmit}
                            disabled={signUpOtp.length !== 4}
                            className="w-full h-12 bg-[#1B4D3E] hover:bg-[#153D31] text-white text-lg font-medium rounded-lg transition-all duration-200 shadow-lg shadow-[#1B4D3E]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Verify & Create Account
                        </Button>
                        <p className="text-xs text-center text-muted-foreground">
                            Didn't receive the code? <button className="text-[#1B4D3E] font-medium hover:underline">Resend</button>
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
