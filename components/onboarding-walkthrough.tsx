"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel"
import { ChevronRight, Camera, MapPin, ThumbsUp } from "lucide-react"
import Image from "next/image"

interface OnboardingWalkthroughProps {
    onGetStarted?: () => void
}

export default function OnboardingWalkthrough({ onGetStarted }: OnboardingWalkthroughProps) {
    const router = useRouter()
    const [api, setApi] = useState<CarouselApi>()
    const [current, setCurrent] = useState(0)

    const slides = [
        {
            id: 1,
            image: "/C:/Users/aymnk/.gemini/antigravity/brain/a2bd108b-cf14-403a-a54a-3b44a93c9f5d/onboarding_camera_ui_1764441693190.png",
            title: "Snap & Fix.",
            description: "See a problem? Just open the camera and tap.",
            icon: Camera,
        },
        {
            id: 2,
            image: "/C:/Users/aymnk/.gemini/antigravity/brain/a2bd108b-cf14-403a-a54a-3b44a93c9f5d/onboarding_map_truck_ui_1764441707343.png",
            title: "Track Your Request.",
            description: "Watch the crew come to you in real-time.",
            icon: MapPin,
        },
        {
            id: 3,
            image: "https://images.unsplash.com/photo-1570126618953-d437136e8c03?q=80&w=2670&auto=format&fit=crop", // Placeholder for voting UI
            title: "Vote for Al-Naeem.",
            description: "Support the best ideas for your neighborhood.",
            icon: ThumbsUp,
        },
    ]

    const handleNext = () => {
        if (api) {
            api.scrollNext()
        }
    }

    const handleGetStarted = () => {
        if (onGetStarted) {
            onGetStarted()
        } else {
            router.push("/auth?mode=signup")
        }
    }

    // Update current slide index
    if (api) {
        api.on("select", () => {
            setCurrent(api.selectedScrollSnap())
        })
    }

    return (
        <div className="min-h-screen bg-[#F5F7F5] flex items-center justify-center p-4">
            {/* iPhone Frame Container */}
            <div className="relative w-full max-w-[375px] aspect-[9/19.5] bg-black rounded-[55px] shadow-2xl border-[8px] border-gray-900 overflow-hidden ring-4 ring-gray-900/20">
                {/* Dynamic Island / Notch Area */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[35px] bg-black rounded-b-[20px] z-50"></div>

                {/* Screen Content */}
                <div className="w-full h-full bg-white relative flex flex-col">
                    <Carousel setApi={setApi} className="w-full flex-1">
                        <CarouselContent className="h-full">
                            {slides.map((slide) => (
                                <CarouselItem key={slide.id} className="h-full flex flex-col">
                                    {/* Image Area */}
                                    <div className="flex-1 relative bg-gray-100">
                                        <Image
                                            src={slide.image}
                                            alt={slide.title}
                                            fill
                                            className="object-cover"
                                            priority
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                    </div>

                                    {/* Content Area */}
                                    <div className="px-8 pt-8 pb-12 bg-white rounded-t-[32px] -mt-8 relative z-10">
                                        <div className="w-12 h-12 bg-[#1B4D3E]/10 rounded-2xl flex items-center justify-center mb-6 text-[#1B4D3E]">
                                            <slide.icon className="w-6 h-6" />
                                        </div>

                                        <h2 className="text-3xl font-bold text-[#1B4D3E] mb-3 font-serif leading-tight">
                                            {slide.title}
                                        </h2>
                                        <p className="text-gray-500 text-lg leading-relaxed mb-8">
                                            {slide.description}
                                        </p>

                                        {/* Action Button */}
                                        {slide.id === 3 ? (
                                            <Button
                                                onClick={handleGetStarted}
                                                className="w-full h-14 bg-[#1B4D3E] hover:bg-[#153D31] text-white text-lg font-semibold rounded-2xl shadow-lg shadow-[#1B4D3E]/25 transition-all active:scale-95"
                                            >
                                                Get Started
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={handleNext}
                                                variant="ghost"
                                                className="w-full h-14 text-[#1B4D3E] font-semibold text-lg hover:bg-[#1B4D3E]/5 rounded-2xl flex items-center justify-between px-4 group"
                                            >
                                                Next
                                                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                            </Button>
                                        )}
                                    </div>
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                    </Carousel>

                    {/* Pagination Indicators */}
                    <div className="absolute top-12 right-6 flex gap-1.5 z-20">
                        {slides.map((_, index) => (
                            <div
                                key={index}
                                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${current === index ? "bg-white w-4" : "bg-white/50"
                                    }`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
