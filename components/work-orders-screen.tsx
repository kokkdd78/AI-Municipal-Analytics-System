"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { MapPin, Trash2, Edit2, CheckCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function WorkOrdersScreen() {
  const { toast } = useToast()
  const [batches, setBatches] = useState([
    {
      id: "A",
      name: "Crew A - Northern Route",
      tasks: [
        { id: 1, title: "Repair Light #402", location: "Main St & 5th Ave", priority: "High" },
        { id: 2, title: "Fill Pothole", location: "Oak Rd", priority: "Medium" },
      ],
    },
    {
      id: "B",
      name: "Crew B - Downtown",
      tasks: [
        { id: 3, title: "Clean Grates", location: "Downtown Core", priority: "Low" },
        { id: 4, title: "Remove Graffiti", location: "Bridge Underpass", priority: "Medium" },
      ],
    },
  ])
  const [isDispatching, setIsDispatching] = useState(false)

  const unassignedReports = [
    { id: 5, title: "Trash Overflow", location: "Park Lane", priority: "Low" },
    { id: 6, title: "Pothole on King Rd", location: "King Rd", priority: "High" },
  ]

  const handleDispatchAll = () => {
    setIsDispatching(true)
    toast({
      title: "Routes Dispatched",
      description: "All crews have been sent their routes.",
    })
    setTimeout(() => setIsDispatching(false), 2000)
  }

  return (
    <div className="flex h-full gap-6 p-6 bg-slate-50">
      {/* Left Panel - AI Route Proposals */}
      <div className="w-96 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between sticky top-0 bg-slate-50 z-10 pb-4">
          <h2 className="text-xl font-bold text-slate-900">AI Route Proposals</h2>
          <Button
            onClick={handleDispatchAll}
            disabled={isDispatching}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isDispatching ? "Dispatching..." : "Dispatch All Crews"}
          </Button>
        </div>

        {/* Batch Cards */}
        {batches.map((batch) => (
          <Card key={batch.id} className="bg-white border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">{batch.name}</h3>
              <div className="flex gap-2">
                <button className="text-slate-400 hover:text-slate-600 transition-colors">
                  <Edit2 className="h-4 w-4" />
                </button>
                <button className="text-slate-400 hover:text-red-600 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {batch.tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300 hover:bg-slate-100 cursor-grab active:cursor-grabbing transition-colors"
                >
                  <p className="font-medium text-sm text-slate-900">{task.title}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-slate-600">
                    <MapPin className="h-3 w-3" />
                    {task.location}
                  </div>
                  <span
                    className={`inline-block mt-2 text-xs px-2 py-1 rounded-full ${
                      task.priority === "High"
                        ? "bg-red-100 text-red-700"
                        : task.priority === "Medium"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {task.priority} Priority
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}

        {/* Unassigned Reports */}
        <Card className="bg-blue-50 border border-blue-200 p-4 sticky bottom-0">
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            Unassigned Reports
          </h4>
          <div className="space-y-2">
            {unassignedReports.map((report) => (
              <div key={report.id} className="p-2 bg-white rounded border border-blue-100 text-xs">
                <p className="font-medium text-slate-900">{report.title}</p>
                <p className="text-slate-600">{report.location}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Right Panel - Route Preview Map */}
      <div className="flex-1 relative">
        <Card className="h-full bg-white border border-slate-200 overflow-hidden">
          <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-50 relative flex items-center justify-center">
            <svg className="w-full h-full opacity-20">
              <defs>
                <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(100,100,150,0.1)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-pattern)" />
            </svg>

            {/* Route Polyline Visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="absolute inset-0" width="100%" height="100%">
                {/* Route line for Crew A */}
                <polyline
                  points="20%,30% 40%,40% 60%,35% 80%,50%"
                  stroke="#2563EB"
                  strokeWidth="3"
                  fill="none"
                  opacity="0.6"
                  strokeDasharray="5,5"
                />
                {/* Task pins */}
                <circle cx="20%" cy="30%" r="8" fill="#2563EB" opacity="0.8" />
                <circle cx="40%" cy="40%" r="8" fill="#2563EB" opacity="0.8" />
                <circle cx="60%" cy="35%" r="8" fill="#2563EB" opacity="0.8" />
                <circle cx="80%" cy="50%" r="8" fill="#2563EB" opacity="0.8" />
              </svg>
            </div>

            {/* Estimated Time Badge */}
            <div className="absolute top-6 right-6 z-20 bg-white shadow-lg rounded-lg px-6 py-3 flex items-center gap-2 border border-slate-200">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-600 uppercase">Estimated Time</span>
                <span className="text-2xl font-bold text-blue-600">4h 30m</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
