"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/context/auth-context"
import { LogOut, Map, FileText, PenTool, AlertCircle, MapPin, Truck, ChevronDown } from "lucide-react"
import WorkOrdersScreen from "./work-orders-screen"
import UrbanPlanningScreen from "./urban-planning-screen"

interface IssuePin {
  id: number
  lat: number
  lng: number
  title: string
  status: "Critical" | "Warning"
}

export default function ManagerDashboard() {
  const { setUserRole } = useAuth()
  const [activeMenu, setActiveMenu] = useState("Operations")
  const [showAlerts, setShowAlerts] = useState(true)
  const [mapLayer, setMapLayer] = useState("Show All")
  const [selectedPin, setSelectedPin] = useState<IssuePin | null>(null)

  // Mock map pins data
  const issuePins: IssuePin[] = [
    { id: 1, lat: 51.2, lng: 4.4, title: "Pothole on Main St", status: "Critical" },
    { id: 2, lat: 51.22, lng: 4.42, title: "Broken Streetlight", status: "Warning" },
    { id: 3, lat: 51.18, lng: 4.38, title: "Graffiti on Bridge", status: "Warning" },
  ]

  const crewPins = [
    { id: 1, lat: 51.21, lng: 4.39, name: "Crew A" },
    { id: 2, lat: 51.19, lng: 4.41, name: "Crew B" },
    { id: 3, lat: 51.23, lng: 4.43, name: "Crew C" },
  ]

  const alerts = [
    { id: 1, severity: "Critical", message: "Sinkhole on King Rd", time: "2m ago" },
    { id: 2, severity: "Warning", message: "Multiple potholes reported", time: "5m ago" },
    { id: 3, severity: "Critical", message: "Streetlight outage Downtown", time: "8m ago" },
  ]

  const menuItems = [
    { label: "Operations", icon: Map },
    { label: "Work Orders", icon: FileText },
    { label: "Urban Planning", icon: PenTool },
  ]

  return (
    <div className="flex h-screen bg-background">
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col fixed left-0 top-0 bottom-0 z-50">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-white font-bold text-lg">Operations Center</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                onClick={() => setActiveMenu(item.label)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeMenu === item.label ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
              F
            </div>
            <span className="text-sm text-white">Fatimah (Manager)</span>
          </div>
          <button
            onClick={() => setUserRole(null)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-sm"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>

      <div className="flex-1 ml-64 relative overflow-hidden">
        {activeMenu === "Operations" && (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-slate-100 overflow-y-auto">
              {/* Map Container */}
              <div className="w-full h-full relative bg-gradient-to-br from-blue-100 to-blue-50 border-2 border-blue-200 flex items-center justify-center">
                <div className="absolute inset-0 opacity-30">
                  {/* Grid pattern for map */}
                  <svg className="w-full h-full">
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(100,100,150,0.1)" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                  </svg>
                </div>

                {/* Issue Pins */}
                {(mapLayer === "Show All" || mapLayer === "Reports Only") &&
                  issuePins.map((pin) => (
                    <button
                      key={pin.id}
                      onClick={() => setSelectedPin(pin)}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
                      style={{ left: `${pin.lng * 100}%`, top: `${pin.lat * 100}%` }}
                    >
                      <div className="relative">
                        <div
                          className="absolute inset-0 animate-pulse bg-red-500 rounded-full blur-md opacity-50"
                          style={{ width: "24px", height: "24px" }}
                        ></div>
                        <MapPin className="h-6 w-6 text-red-600 relative z-10" fill="currentColor" />
                      </div>
                    </button>
                  ))}

                {/* Crew Truck Icons */}
                {(mapLayer === "Show All" || mapLayer === "Crews Only") &&
                  crewPins.map((pin) => (
                    <div
                      key={pin.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${pin.lng * 100}%`, top: `${pin.lat * 100}%` }}
                    >
                      <div className="bg-green-500 rounded-full p-2 shadow-lg">
                        <Truck className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="absolute top-6 left-6 z-20">
              <Card className="bg-white/90 backdrop-blur-sm border border-white shadow-lg p-4 w-72">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Live Statistics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Active Reports</span>
                    <span className="text-lg font-bold text-red-600">142</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Crews Online</span>
                    <span className="text-lg font-bold text-green-600">8</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Avg Fix Time</span>
                    <span className="text-lg font-bold text-blue-600">4.2h</span>
                  </div>
                </div>
              </Card>
            </div>

            <div className="absolute top-6 right-6 z-20 w-80">
              <Card
                className={`bg-white/90 backdrop-blur-sm border border-white shadow-lg overflow-hidden transition-all ${showAlerts ? "max-h-96" : "max-h-12"}`}
              >
                <button
                  onClick={() => setShowAlerts(!showAlerts)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 border-b border-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Incoming Alerts</h3>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAlerts ? "rotate-180" : ""}`} />
                </button>

                {showAlerts && (
                  <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`px-4 py-3 border-l-4 ${
                          alert.severity === "Critical"
                            ? "border-l-red-500 bg-red-50/50"
                            : "border-l-yellow-500 bg-yellow-50/50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p
                              className={`text-xs font-semibold ${alert.severity === "Critical" ? "text-red-700" : "text-yellow-700"}`}
                            >
                              {alert.severity}
                            </p>
                            <p className="text-sm text-slate-900 font-medium mt-1">{alert.message}</p>
                          </div>
                          <span className="text-xs text-slate-500 ml-2">{alert.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
              <Card className="bg-white/90 backdrop-blur-sm border border-white shadow-lg p-2 flex gap-2">
                {["Show All", "Crews Only", "Reports Only"].map((layer) => (
                  <button
                    key={layer}
                    onClick={() => setMapLayer(layer)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      mapLayer === layer
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {layer}
                  </button>
                ))}
              </Card>
            </div>

            {selectedPin && (
              <div className="absolute bottom-6 right-6 z-20">
                <Card className="bg-white border border-slate-200 shadow-lg p-4 w-80">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Issue Details</p>
                      <h4 className="text-lg font-bold text-slate-900 mt-1">{selectedPin.title}</h4>
                    </div>
                    <button onClick={() => setSelectedPin(null)} className="text-slate-400 hover:text-slate-600">
                      ✕
                    </button>
                  </div>
                  <div className="mb-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        selectedPin.status === "Critical" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {selectedPin.status}
                    </span>
                  </div>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">Assign to Crew</Button>
                </Card>
              </div>
            )}
          </>
        )}

        {activeMenu === "Work Orders" && <WorkOrdersScreen />}

        {activeMenu === "Urban Planning" && <UrbanPlanningScreen />}
      </div>
    </div>
  )
}
