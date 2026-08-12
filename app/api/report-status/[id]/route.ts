import { type NextRequest, NextResponse } from "next/server"

interface ReportStatus {
  id: string
  type: string
  createdAt: string
  district: string
  severity: string
  location: { lat: number; lng: number }
  currentStatus: number
  timeline: { time: string; text: string }[]
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Phase 1 keeps this deterministic demo fallback until database persistence is introduced.
    const hash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const statusOptions = [0, 1, 2, 3]
    const severityOptions = ["Low", "Medium", "High"]
    const typeOptions = ["Pothole", "Broken Streetlight", "Trash", "Water Leak", "Tree Branch"]
    const districtOptions = ["Al-Naeem", "Al-Rawdah", "Al-Mansouri", "Al-Shati"]

    const currentStatus = statusOptions[hash % statusOptions.length]
    const severity = severityOptions[hash % severityOptions.length]
    const type = typeOptions[hash % typeOptions.length]
    const district = districtOptions[hash % districtOptions.length]

    const report: ReportStatus = {
      id,
      type,
      createdAt: new Date(Date.UTC(2026, 7, 1 + (hash % 7), 9, 0, 0)).toISOString(),
      district,
      severity,
      location: {
        lat: 21.5 + (hash % 20) / 100,
        lng: 39.1 + (hash % 20) / 100,
      },
      currentStatus,
      timeline: [
        {
          time: new Date(Date.now() - 30 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: "Report received by the system",
        },
        {
          time: new Date(Date.now() - 20 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: "Assigned to the maintenance team",
        },
        ...(currentStatus >= 2
          ? [
              {
                time: new Date(Date.now() - 10 * 60 * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                text: "Team is heading to the location",
              },
            ]
          : []),
        ...(currentStatus >= 3
          ? [
              {
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                text: "Issue resolved",
              },
            ]
          : []),
      ],
    }

    return NextResponse.json(report, { status: 200 })
  } catch (error) {
    console.error("Error in report-status API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
