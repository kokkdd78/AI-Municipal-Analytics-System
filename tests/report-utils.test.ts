import { describe, expect, it } from "vitest"

import {
  formatReportStatus,
  getReportPhotoUrl,
  isReportOwnedByUser,
  reportStatusStep,
} from "../lib/report-utils"

describe("canonical report helpers", () => {
  it("formats and maps every report status", () => {
    expect(formatReportStatus("pending")).toBe("Pending")
    expect(formatReportStatus("in-progress")).toBe("In Progress")
    expect(formatReportStatus("resolved")).toBe("Resolved")
    expect(reportStatusStep("pending")).toBe(0)
    expect(reportStatusStep("in-progress")).toBe(2)
    expect(reportStatusStep("resolved")).toBe(3)
  })

  it("selects the report photo from canonical attachments", () => {
    expect(
      getReportPhotoUrl({
        attachments: [
          {
            id: "attachment-1",
            name: "evidence.jpg",
            mimeType: "image/jpeg",
            url: "data:image/jpeg;base64,example",
            kind: "report-photo",
          },
        ],
      }),
    ).toBe("data:image/jpeg;base64,example")
  })

  it("keeps report ownership stable when the profile name changes", () => {
    const report = { authorId: "citizen-1" }
    const originalUser = { id: "citizen-1", name: "Ayman" }
    const renamedUser = { ...originalUser, name: "Ayman AlJenidi" }

    expect(isReportOwnedByUser(report, originalUser)).toBe(true)
    expect(isReportOwnedByUser(report, renamedUser)).toBe(true)
  })
})
