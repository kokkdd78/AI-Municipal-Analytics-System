"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Briefcase, UserCog, HardHat } from "lucide-react"
import { useAuth } from "@/context/auth-context"

interface EmployeeLoginScreenProps {
    onBack: () => void
}

export default function EmployeeLoginScreen({ onBack }: EmployeeLoginScreenProps) {
    const { setUserRole } = useAuth()
    const [employeeId, setEmployeeId] = useState("")
    const [employeePassword, setEmployeePassword] = useState("")
    const [employeeRole, setEmployeeRole] = useState<"Manager" | "Crew">("Manager")

    const handleEmployeeLogin = () => {
        setUserRole(employeeRole)
    }

    return (
        <div className="min-h-screen flex bg-[#F5F7F5]">
            {/* Left Side - Brand */}
            <div className="hidden md:flex md:w-1/2 bg-[#1B4D3E] flex-col items-center justify-center text-white p-12 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[url('/placeholder.jpg')] bg-cover bg-center mix-blend-overlay"></div>
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

            {/* Right Side - Employee Login Form */}
            <div className="w-full md:w-1/2 flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h2 className="text-3xl font-serif text-[#1B4D3E] mb-2">Employee Sign In</h2>
                        <p className="text-muted-foreground">Select your role and enter credentials</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setEmployeeRole("Manager")}
                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3 ${employeeRole === "Manager"
                                    ? "border-[#1B4D3E] bg-[#1B4D3E]/5 text-[#1B4D3E]"
                                    : "border-gray-100 bg-white text-gray-500 hover:border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <div
                                className={`h-10 w-10 rounded-full flex items-center justify-center ${employeeRole === "Manager" ? "bg-[#1B4D3E] text-white" : "bg-gray-100 text-gray-500"
                                    }`}
                            >
                                <UserCog className="h-5 w-5" />
                            </div>
                            <span className="font-medium">Manager</span>
                        </button>

                        <button
                            onClick={() => setEmployeeRole("Crew")}
                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3 ${employeeRole === "Crew"
                                    ? "border-[#1B4D3E] bg-[#1B4D3E]/5 text-[#1B4D3E]"
                                    : "border-gray-100 bg-white text-gray-500 hover:border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <div
                                className={`h-10 w-10 rounded-full flex items-center justify-center ${employeeRole === "Crew" ? "bg-[#1B4D3E] text-white" : "bg-gray-100 text-gray-500"
                                    }`}
                            >
                                <HardHat className="h-5 w-5" />
                            </div>
                            <span className="font-medium">Field Crew</span>
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#1B4D3E]">Employee ID</label>
                            <Input
                                type="text"
                                placeholder={employeeRole === "Manager" ? "e.g. M-1024" : "e.g. C-402"}
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#1B4D3E]">Password</label>
                            <Input
                                type="password"
                                placeholder="Enter your password"
                                value={employeePassword}
                                onChange={(e) => setEmployeePassword(e.target.value)}
                                className="h-12 bg-white border-gray-200 focus:border-[#1B4D3E] focus:ring-[#1B4D3E]/20"
                            />
                        </div>

                        <Button
                            onClick={handleEmployeeLogin}
                            className="w-full h-12 bg-[#1B4D3E] hover:bg-[#153D31] text-white text-lg font-medium rounded-lg transition-all duration-200 shadow-lg shadow-[#1B4D3E]/20"
                        >
                            Access Dashboard
                        </Button>

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
                            onClick={onBack}
                            className="w-full h-12 border-[#1B4D3E] text-[#1B4D3E] hover:bg-[#1B4D3E]/5"
                        >
                            Back to Citizen Login
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
