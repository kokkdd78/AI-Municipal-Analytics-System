'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface CrewRouteScreenProps {
  onTaskClick: (taskId: number) => void
}

export default function CrewRouteScreen({ onTaskClick }: CrewRouteScreenProps) {
  const tasks = [
    { id: 1, title: 'Repair Streetlight', address: 'Main St & 5th Ave', distance: '0.3 km', status: 'active' },
    { id: 2, title: 'Fill Pothole', address: 'Oak Boulevard', distance: '1.2 km', status: 'pending' },
    { id: 3, title: 'Remove Debris', address: 'Park Lane', distance: '2.8 km', status: 'pending' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-6">
        <h1 className="text-3xl font-bold">Route #1042</h1>
        <p className="text-slate-400 mt-2">Truck ID: 402 - <span className="text-green-500 font-semibold">Online</span></p>
      </div>

      {/* Tasks */}
      <div className="p-6 space-y-4">
        {tasks.map((task, index) => (
          <Card
            key={task.id}
            onClick={() => onTaskClick(task.id)}
            className={`p-4 cursor-pointer transition-all border ${
              task.status === 'active'
                ? 'bg-white text-slate-900 border-white'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <div className="flex gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-900 font-bold flex-shrink-0">
                {index + 1}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{task.title}</h3>
                <p className={task.status === 'active' ? 'text-slate-600 text-sm' : 'text-slate-400 text-sm'}>
                  {task.address}
                </p>
              </div>
              <div className={`text-right font-semibold ${task.status === 'active' ? 'text-slate-900' : 'text-slate-400'}`}>
                {task.distance}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4">
        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3">
          Start Navigation for Task #1
        </Button>
      </div>

      <div className="h-20" />
    </div>
  )
}
