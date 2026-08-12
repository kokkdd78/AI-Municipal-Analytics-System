"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { ChevronRight, Trophy, LogOut, ChevronLeft } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { useData } from "@/context/data-context"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { JEDDAH_DISTRICTS } from "@/constants/districts"
import type { MunicipalUser } from "@/types/domain"
import { useRouter } from "next/navigation"
import { isReportOwnedByUser } from "@/lib/report-utils"

export default function ProfileScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { setUserRole } = useAuth()
  const router = useRouter()
  const { user, reports, votedReports, suggestions, votedSuggestions, updateUser } = useData()
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)

  // Calculate stats
  const myReportsCount = reports.filter((report) => isReportOwnedByUser(report, user)).length

  const suggestionsMade = suggestions.length
  const totalInteractions = votedReports.size + votedSuggestions.size + suggestionsMade

  const stats = [
    {
      label: "Reports Submitted",
      value: myReportsCount.toString(),
      color: "bg-blue-100",
      textColor: "text-primary",
      icon: "📋",
      onClick: () => router.push("/my-reports"),
    },
    {
      label: "Suggestions Made",
      value: suggestionsMade.toString(),
      color: "bg-purple-100",
      textColor: "text-purple-600",
      icon: Trophy,
      onClick: () => { },
    },
    {
      label: "Total Interactions",
      value: totalInteractions.toString(),
      color: "bg-green-100",
      textColor: "text-green-600",
      icon: "✅",
      onClick: () => { },
    },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Profile Header */}
      <div className="px-6 py-8 bg-gradient-to-b from-primary/5 to-background border-b border-border text-center relative">
        <Button variant="ghost" size="icon" className="absolute top-4 left-4" onClick={() => onNavigate("home")}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <Avatar className="h-20 w-20 mx-auto mb-4">
          <AvatarImage src={user.avatar || "/placeholder.svg"} />
          <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <h2 className="text-2xl font-bold text-foreground">{user.name}</h2>
        <p className="text-muted-foreground text-sm mt-1">{user.district}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat, idx) => (
            <Card
              key={idx}
              className={`p-4 text-center ${stat.color} cursor-pointer transition-transform hover:scale-105`}
              onClick={stat.onClick}
            >
              <p className={`text-2xl font-bold ${stat.textColor} mb-1`}>{stat.value}</p>
              <p className="text-xs text-foreground font-medium line-clamp-2">{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Settings */}
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Account</h3>
          <Card
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsEditProfileOpen(true)}
          >
            <span className="text-sm text-foreground">Edit Profile</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
          <Card className="p-4 flex items-center justify-between">
            <span className="text-sm text-foreground">Change Password</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
          <Card
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-red-50 transition-colors group"
            onClick={() => {
              setUserRole(null)
              window.location.href = "/"
            }}
          >
            <span className="text-sm text-red-600 font-medium group-hover:text-red-700">Sign Out</span>
            <LogOut className="h-4 w-4 text-red-500 group-hover:text-red-600" />
          </Card>
        </div>

        {/* Preferences */}
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Preferences</h3>
          <Card className="p-4 flex items-center justify-between">
            <span className="text-sm text-foreground">Notifications</span>
            <Switch defaultChecked />
          </Card>
          <Card className="p-4 flex items-center justify-between">
            <span className="text-sm text-foreground">Dark Mode</span>
            <Switch />
          </Card>
        </div>

        {/* Support */}
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Support</h3>
          <Card className="p-4 flex items-center justify-between">
            <span className="text-sm text-foreground">Help & FAQ</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
          <Card className="p-4 flex items-center justify-between">
            <span className="text-sm text-foreground">About Us</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        </div>
      </div>

      <EditProfileModal
        open={isEditProfileOpen}
        onOpenChange={setIsEditProfileOpen}
        user={user}
        updateUser={updateUser}
      />

      {/* Placeholder for Reports List Modal - can be implemented similarly */}
    </div >
  )
}

function EditProfileModal({
  open,
  onOpenChange,
  user,
  updateUser,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: MunicipalUser
  updateUser: (updates: Partial<MunicipalUser>) => void
}) {
  const [name, setName] = useState(user.name)
  const [district, setDistrict] = useState(user.district)
  const [avatar, setAvatar] = useState(user.avatar)

  const handleSave = () => {
    updateUser({ name, district, avatar })
    onOpenChange(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatar(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex flex-col items-center gap-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={avatar || "/placeholder.svg"} />
              <AvatarFallback>{name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                className="hidden"
                id="avatar-upload"
                onChange={handleFileChange}
              />
              <Label
                htmlFor="avatar-upload"
                className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2"
              >
                Change Photo
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>District</Label>
            <Select value={district} onValueChange={setDistrict}>
              <SelectTrigger>
                <SelectValue placeholder="Select District" />
              </SelectTrigger>
              <SelectContent>
                {JEDDAH_DISTRICTS.map((dist) => (
                  <SelectItem key={dist.id} value={dist.name}>
                    {dist.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} className="w-full">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
