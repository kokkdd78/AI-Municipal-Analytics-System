"use client"

import * as React from "react"
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "@/components/ui/carousel"
import Image from "next/image"

export function OnboardingCarousel() {
    const [api, setApi] = React.useState<CarouselApi>()

    React.useEffect(() => {
        if (!api) {
            return
        }

        const intervalId = setInterval(() => {
            api.scrollNext()
        }, 4000)

        return () => clearInterval(intervalId)
    }, [api])

    const slides = [
        {
            image: "/placeholder.jpg",
            title: "See It, Fix It",
            description: "Report issues like potholes instantly. Watch as your city transforms with every report.",
        },
        {
            image: "/placeholder.jpg",
            title: "Your Voice Matters",
            description: "Vote on local projects and decide where resources go. You have the power to shape your neighborhood.",
        },
        {
            image: "/placeholder.jpg",
            title: "Stronger Together",
            description: "Join a community of active citizens. Build trust and pride in your city, one interaction at a time.",
        },
    ]

    return (
        <div className="w-full h-full relative">
            <Carousel
                setApi={setApi}
                className="w-full h-full"
                opts={{
                    loop: true,
                }}
            >
                <CarouselContent className="h-full ml-0">
                    {slides.map((slide, index) => (
                        <CarouselItem key={index} className="pl-0 h-full relative">
                            <div className="relative w-full h-full">
                                <Image
                                    src={slide.image}
                                    alt={slide.title}
                                    fill
                                    className="object-cover"
                                    priority={index === 0}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-12 text-white">
                                    <h2 className="text-4xl font-bold mb-4 font-serif">{slide.title}</h2>
                                    <p className="text-lg text-white/90 max-w-md leading-relaxed">
                                        {slide.description}
                                    </p>
                                </div>
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>
        </div>
    )
}
