"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/context/auth-context"
import { LogOut, CheckCircle2, Clock } from "lucide-react"
import CrewRouteScreen from "./crew-route-screen"
import TaskExecutionScreen from "./task-execution-screen"

type CrewScreen = "dashboard" | "route" | "task-execution" | "completion-camera"

export default function CrewTaskList() {
  const { setUserRole } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<CrewScreen>("dashboard")
  const [shiftStarted, setShiftStarted] = useState(false)

  const handleTaskClick = (taskId: number) => {
    setCurrentScreen("task-execution")
  }

  const handleTaskComplete = () => {
    setCurrentScreen("completion-camera")
  }

  const handleStartShift = () => {
    setShiftStarted(true)
    setTimeout(() => {
      setCurrentScreen("route")
    }, 1500)
  }

  if (currentScreen === "route") {
    return <CrewRouteScreen onTaskClick={handleTaskClick} />
  }

  if (currentScreen === "task-execution") {
    return <TaskExecutionScreen onComplete={handleTaskComplete} onBack={() => setCurrentScreen("route")} />
  }

  if (currentScreen === "completion-camera") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Completion Camera Screen</h1>
          <p className="text-slate-400 mb-8">Coming next...</p>
          <Button onClick={() => setCurrentScreen("dashboard")} className="bg-blue-600 hover:bg-blue-700">
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Field Tasks</h1>
            <p className="text-muted-foreground">Welcome, Khalid</p>
          </div>
          <button
            onClick={() => setUserRole(null)}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">Tasks Today</p>
                <p className="text-3xl font-bold text-foreground mt-2">7</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">Completed</p>
                <p className="text-3xl font-bold text-foreground mt-2">5</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </Card>
        </div>

        <Card className="p-6 bg-card border-border">
          <h2 className="text-xl font-bold text-foreground mb-4">Today's Shift</h2>
          <p className="text-muted-foreground mb-6">
            {shiftStarted ? "Syncing with server..." : "Start your shift to view and complete tasks."}
          </p>
          <Button
            onClick={handleStartShift}
            disabled={shiftStarted}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {shiftStarted ? "Syncing..." : "Start Shift"}
          </Button>
        </Card>
      </div>
    </div>
  )
}
