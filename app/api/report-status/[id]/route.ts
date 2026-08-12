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

    const reportsData = typeof window !== "undefined" ? localStorage.getItem("reports") : null
    let actualReport = null

    if (reportsData) {
      try {
        const reports = JSON.parse(reportsData)
        actualReport = reports.find((r: any) => r.id === id)
      } catch (e) {
        console.error("Error parsing reports from localStorage:", e)
      }
    }

    // If actual report found, use its data
    if (actualReport) {
      const report: ReportStatus = {
        id: actualReport.id,
        type: actualReport.title || "Unknown Issue",
        createdAt: actualReport.createdAt || new Date().toISOString(),
        district: actualReport.district || "Unknown District",
        severity: actualReport.severity || "Medium",
        location: { lat: actualReport.lat || 21.5433, lng: actualReport.lng || 39.1728 },
        currentStatus: 0,
        timeline: [
          {
            time: new Date(actualReport.createdAt || Date.now()).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            text: "Report received by the system",
          },
        ],
      }
      return NextResponse.json(report, { status: 200 })
    }

    // Generate mock report based on ID (fallback)
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
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      district,
      severity,
      location: {
        lat: 21.5 + Math.random() * 0.2,
        lng: 39.1 + Math.random() * 0.2,
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
