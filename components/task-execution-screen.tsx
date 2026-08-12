'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertCircle, MapPin, Navigation } from 'lucide-react'
import Image from 'next/image'

interface TaskExecutionScreenProps {
  onComplete: () => void
  onBack: () => void
}

export default function TaskExecutionScreen({ onComplete, onBack }: TaskExecutionScreenProps) {
  const [distance, setDistance] = useState(2.4)
  const [isCompleteEnabled, setIsCompleteEnabled] = useState(false)

  const handleSimulateArrival = () => {
    setDistance(0.01)
    setIsCompleteEnabled(true)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-32">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-6">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white mb-3 text-sm"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold">Task #1: Deep Pothole</h1>
        <p className="text-red-500 font-semibold mt-2">Priority: High</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Location Card */}
        <Card className="bg-slate-800 border-slate-700 p-4">
          <div className="flex gap-3">
            <MapPin className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <p className="text-slate-300 text-sm">School Entrance, Main St</p>
              <p className="text-slate-500 text-xs mt-1">Static map preview</p>
            </div>
          </div>
        </Card>

        {/* Navigate Button */}
        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 gap-2">
          <Navigation className="h-5 w-5" />
          Navigate (Google Maps)
        </Button>

        {/* Issue Details */}
        <Card className="bg-slate-800 border-slate-700 p-4">
          <p className="text-slate-300 mb-4">
            Large pothole reported near the school entrance. Immediate attention required for safety.
          </p>
          <div className="w-full h-40 bg-slate-700 rounded-md flex items-center justify-center">
            <Image
              src="/placeholder.jpg"
              alt="Issue photo"
              width={800}
              height={320}
              unoptimized
              className="w-full h-full object-cover rounded-md"
            />
          </div>
        </Card>

        {/* Safety Warning */}
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-200 text-sm">Caution: School Zone</p>
        </div>

        {/* Dev Mode Trigger */}
        <button
          onClick={handleSimulateArrival}
          className="text-blue-400 hover:text-blue-300 text-xs underline"
        >
          Simulate Arrival
        </button>
      </div>

      {/* Geofence Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4">
        <div className="mb-4">
          <p className={`text-sm font-semibold ${distance < 0.05 ? 'text-green-500' : 'text-slate-300'}`}>
            Distance to Target: {distance.toFixed(2)} km
          </p>
        </div>
        <Button
          onClick={onComplete}
          disabled={!isCompleteEnabled}
          className={`w-full font-semibold py-3 ${
            isCompleteEnabled
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          Mark as Complete
        </Button>
      </div>
    </div>
  )
}
