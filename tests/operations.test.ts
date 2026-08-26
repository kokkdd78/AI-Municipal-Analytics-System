import { describe, expect, it } from "vitest"
import { createOperationsService } from "../lib/operations/service"

const citizen = { id: "citizen-1", name: "Citizen", role: "Citizen" as const, isActive: true as const, avatarUrl: null, districtId: null, departmentId: null }
const manager = { id: "manager-1", name: "Manager", role: "Manager" as const, isActive: true as const, avatarUrl: null, districtId: null, departmentId: null }
const crew = { id: "crew-1", name: "Crew", role: "Crew" as const, isActive: true as const, avatarUrl: null, districtId: null, departmentId: null }

describe("Phase 4 municipal workflow guards", () => {
  it("does not allow a Citizen to use manager dashboard operations", async () => {
    const service = createOperationsService({} as never)
    await expect(service.dashboard(citizen, { page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("does not allow a Manager to submit crew task updates", async () => {
    const service = createOperationsService({} as never)
    await expect(service.crewUpdate(manager, "order-1", { status: "ACTIVE" })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("requires completed work before a Manager can resolve a report", async () => {
    const service = createOperationsService({
      $transaction: async (callback: (tx: { report: { findUnique: () => Promise<unknown> } }) => Promise<unknown>) => callback({ report: { findUnique: async () => ({ id: "report-1", status: "IN_PROGRESS", workOrders: [{ status: "ACTIVE" }] }) } }),
    } as never)
    await expect(service.approveClosure(manager, "report-1")).rejects.toMatchObject({ code: "conflict" })
  })

  it("does not allow unassigned Crew to upload completion evidence", async () => {
    const service = createOperationsService({ workOrder: { findFirst: async () => null } } as never)
    await expect(service.addCompletionEvidence(crew, "order-1", { name: "evidence.png", mimeType: "image/png", url: "https://example.test/evidence.png" })).rejects.toMatchObject({ code: "not-found" })
  })
})
