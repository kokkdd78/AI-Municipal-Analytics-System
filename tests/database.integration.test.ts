import "dotenv/config"

import { PrismaNeon } from "@prisma/adapter-neon"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  AttachmentKind,
  PrismaClient,
  ReportSeverity,
  ReportStatus,
  SuggestionStatus,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from "../generated/prisma/client"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url"
import { deriveExistingUserAuthEmail } from "../lib/auth/identifiers"
import { seedDatabase } from "../prisma/seed"

const PREFIX = "phase2a-integration-"
const IDS = {
  district: `${PREFIX}district`,
  department: `${PREFIX}department`,
  citizen: `${PREFIX}citizen`,
  manager: `${PREFIX}manager`,
  crew: `${PREFIX}crew`,
  report: `${PREFIX}report`,
  otherReport: `${PREFIX}other-report`,
  suggestion: `${PREFIX}suggestion`,
  workOrder: `${PREFIX}work-order`,
}

let prisma: PrismaClient

function withoutId<T extends { id: string }>({ id, ...value }: T): Omit<T, "id"> {
  void id
  return value
}

async function databaseRowCounts(): Promise<Record<string, number>> {
  const [
    users,
    departments,
    districts,
    reports,
    attachments,
    reportVotes,
    suggestions,
    suggestionVotes,
    workOrders,
    crewAssignments,
    reportHistories,
    workOrderHistories,
    auditLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.department.count(),
    prisma.district.count(),
    prisma.report.count(),
    prisma.attachment.count(),
    prisma.vote.count(),
    prisma.suggestion.count(),
    prisma.suggestionVote.count(),
    prisma.workOrder.count(),
    prisma.crewAssignment.count(),
    prisma.statusHistory.count(),
    prisma.workOrderStatusHistory.count(),
    prisma.auditLog.count(),
  ])

  return {
    users,
    departments,
    districts,
    reports,
    attachments,
    reportVotes,
    suggestions,
    suggestionVotes,
    workOrders,
    crewAssignments,
    reportHistories,
    workOrderHistories,
    auditLogs,
  }
}

async function cleanupTestRecords(): Promise<void> {
  requireSafeTestDatabaseUrl()

  await prisma.attachment.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.vote.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.suggestionVote.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.workOrderStatusHistory.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.statusHistory.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.crewAssignment.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.workOrder.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.suggestion.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.report.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.auditLog.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.department.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.district.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

describe("Phase 2A Neon database foundation", () => {
  beforeAll(async () => {
    const testUrl = requireSafeTestDatabaseUrl()
    prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: testUrl }) })
    await cleanupTestRecords()

    await prisma.district.create({
      data: { id: IDS.district, name: "Phase 2A Test District", arabicName: "حي الاختبار" },
    })
    await prisma.department.create({
      data: { id: IDS.department, name: "Phase 2A Test Department", description: "Integration test data" },
    })
    await prisma.user.createMany({
      data: [
        {
          id: IDS.citizen,
          name: "Test Citizen",
          authEmail: deriveExistingUserAuthEmail(IDS.citizen),
          role: UserRole.Citizen,
          districtId: IDS.district,
        },
        {
          id: IDS.manager,
          name: "Test Manager",
          authEmail: deriveExistingUserAuthEmail(IDS.manager),
          role: UserRole.Manager,
          districtId: IDS.district,
          departmentId: IDS.department,
          employeeId: `${PREFIX}M-1`,
        },
        {
          id: IDS.crew,
          name: "Test Crew",
          authEmail: deriveExistingUserAuthEmail(IDS.crew),
          role: UserRole.Crew,
          districtId: IDS.district,
          departmentId: IDS.department,
          employeeId: `${PREFIX}C-1`,
        },
      ],
    })
    await prisma.report.createMany({
      data: [
        {
          id: IDS.report,
          authorId: IDS.citizen,
          departmentId: IDS.department,
          districtId: IDS.district,
          title: "Integration pothole",
          description: "Database integration report",
          category: "pothole",
          status: ReportStatus.PENDING,
          severity: ReportSeverity.HIGH,
          latitude: 21.6,
          longitude: 39.2,
        },
        {
          id: IDS.otherReport,
          authorId: IDS.citizen,
          departmentId: IDS.department,
          districtId: IDS.district,
          title: "Separate integration report",
          description: "Used to verify work-order attachment integrity",
          category: "lighting",
          status: ReportStatus.PENDING,
          severity: ReportSeverity.MEDIUM,
          latitude: 21.62,
          longitude: 39.22,
        },
      ],
    })
    await prisma.suggestion.create({
      data: {
        id: IDS.suggestion,
        authorId: IDS.citizen,
        districtId: IDS.district,
        title: "Integration park",
        description: "Database integration suggestion",
        category: "park",
        status: SuggestionStatus.UNDER_REVIEW,
        latitude: 21.61,
        longitude: 39.21,
      },
    })
  }, 60_000)

  afterAll(async () => {
    if (!prisma) return
    await cleanupTestRecords()
    await prisma.$disconnect()
  }, 60_000)

  it("enforces report foreign keys and SQL value constraints", async () => {
    await expect(
      prisma.report.create({
        data: {
          id: `${PREFIX}missing-district-report`,
          districtId: `${PREFIX}missing-district`,
          title: "Missing district",
          description: "Must fail its foreign key",
          category: "other",
          latitude: 21.6,
          longitude: 39.2,
        },
      }),
    ).rejects.toThrow()

    await expect(
      prisma.report.create({
        data: {
          id: `${PREFIX}invalid-values-report`,
          districtId: IDS.district,
          title: " ",
          description: "Invalid coordinates and vote baseline",
          category: "other",
          latitude: 91,
          longitude: 39.2,
          importedVoteBaseline: -1,
        },
      }),
    ).rejects.toThrow()
  }, 60_000)

  it("rejects duplicate report and suggestion votes", async () => {
    await prisma.vote.create({
      data: { id: `${PREFIX}report-vote`, reportId: IDS.report, userId: IDS.citizen },
    })
    await expect(
      prisma.vote.create({
        data: { id: `${PREFIX}report-vote-duplicate`, reportId: IDS.report, userId: IDS.citizen },
      }),
    ).rejects.toThrow()

    await prisma.suggestionVote.create({
      data: { id: `${PREFIX}suggestion-vote`, suggestionId: IDS.suggestion, userId: IDS.citizen },
    })
    await expect(
      prisma.suggestionVote.create({
        data: {
          id: `${PREFIX}suggestion-vote-duplicate`,
          suggestionId: IDS.suggestion,
          userId: IDS.citizen,
        },
      }),
    ).rejects.toThrow()

    expect(await prisma.vote.count({ where: { reportId: IDS.report } })).toBe(1)
    expect(await prisma.suggestionVote.count({ where: { suggestionId: IDS.suggestion } })).toBe(1)
  }, 60_000)

  it("stores report histories, work orders, unique crew assignments, and completion evidence", async () => {
    await prisma.statusHistory.create({
      data: {
        id: `${PREFIX}report-history`,
        reportId: IDS.report,
        actorId: IDS.manager,
        fromStatus: ReportStatus.PENDING,
        toStatus: ReportStatus.IN_PROGRESS,
        note: "Manager accepted the report",
      },
    })

    await prisma.workOrder.create({
      data: {
        id: IDS.workOrder,
        reportId: IDS.report,
        departmentId: IDS.department,
        createdById: IDS.manager,
        title: "Repair integration pothole",
        description: "Complete the integration-test repair",
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.ACTIVE,
        locationText: "Phase 2A Test District",
      },
    })
    await prisma.crewAssignment.create({
      data: {
        id: `${PREFIX}crew-assignment`,
        workOrderId: IDS.workOrder,
        crewUserId: IDS.crew,
        assignedById: IDS.manager,
      },
    })
    await expect(
      prisma.crewAssignment.create({
        data: {
          id: `${PREFIX}crew-assignment-duplicate`,
          workOrderId: IDS.workOrder,
          crewUserId: IDS.crew,
          assignedById: IDS.manager,
        },
      }),
    ).rejects.toThrow()

    await prisma.workOrderStatusHistory.create({
      data: {
        id: `${PREFIX}work-order-history`,
        workOrderId: IDS.workOrder,
        actorId: IDS.crew,
        fromStatus: WorkOrderStatus.PENDING,
        toStatus: WorkOrderStatus.ACTIVE,
        note: "Crew started the task",
      },
    })
    await prisma.attachment.create({
      data: {
        id: `${PREFIX}completion-evidence`,
        reportId: IDS.report,
        workOrderId: IDS.workOrder,
        workOrderReportId: IDS.report,
        uploadedById: IDS.crew,
        name: "completion.jpg",
        mimeType: "image/jpeg",
        url: "data:image/jpeg;base64,phase2a-integration-evidence",
        kind: AttachmentKind.COMPLETION_EVIDENCE,
      },
    })
    await prisma.attachment.create({
      data: {
        id: `${PREFIX}report-only-photo`,
        reportId: IDS.report,
        uploadedById: IDS.citizen,
        name: "report.jpg",
        mimeType: "image/jpeg",
        url: "data:image/jpeg;base64,phase2a-integration-report",
        kind: AttachmentKind.REPORT_PHOTO,
      },
    })

    await expect(
      prisma.attachment.create({
        data: {
          id: `${PREFIX}mismatched-evidence`,
          reportId: IDS.otherReport,
          workOrderId: IDS.workOrder,
          workOrderReportId: IDS.otherReport,
          uploadedById: IDS.crew,
          name: "mismatch.jpg",
          mimeType: "image/jpeg",
          url: "data:image/jpeg;base64,phase2a-integration-mismatch",
          kind: AttachmentKind.COMPLETION_EVIDENCE,
        },
      }),
    ).rejects.toThrow()

    await expect(
      prisma.$executeRaw`
        INSERT INTO "attachments"
          ("id", "reportId", "workOrderId", "workOrderReportId", "name", "mimeType", "url", "kind", "createdAt")
        VALUES
          (${`${PREFIX}missing-report-evidence`}, ${null}, ${IDS.workOrder}, ${null}, 'missing.jpg', 'image/jpeg', 'data:image/jpeg;base64,missing-report', 'completion-evidence', CURRENT_TIMESTAMP)
      `,
    ).rejects.toThrow()

    const workOrder = await prisma.workOrder.findUniqueOrThrow({
      where: { id: IDS.workOrder },
      include: { crewAssignments: true, statusHistory: true, attachments: true },
    })
    const reportHistory = await prisma.statusHistory.findMany({ where: { reportId: IDS.report } })

    expect(workOrder.crewAssignments).toHaveLength(1)
    expect(workOrder.statusHistory).toHaveLength(1)
    expect(workOrder.attachments).toMatchObject([
      { kind: AttachmentKind.COMPLETION_EVIDENCE, uploadedById: IDS.crew },
    ])
    expect(
      await prisma.attachment.count({ where: { id: `${PREFIX}report-only-photo`, workOrderId: null } }),
    ).toBe(1)
    expect(reportHistory).toMatchObject([{ toStatus: ReportStatus.IN_PROGRESS, actorId: IDS.manager }])
  }, 60_000)

  it("re-seeds without overwriting municipal activity or duplicating relationships", async () => {
    await seedDatabase(prisma)

    const [
      originalUser,
      originalReport,
      originalSuggestion,
      originalWorkOrder,
      originalAssignment,
      originalReportHistory,
      originalWorkOrderHistory,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: "demo-citizen" } }),
      prisma.report.findUniqueOrThrow({ where: { id: "main-1" } }),
      prisma.suggestion.findUniqueOrThrow({ where: { id: "suggestion-main-1" } }),
      prisma.workOrder.findUniqueOrThrow({ where: { id: "work-order-main-1" } }),
      prisma.crewAssignment.findUniqueOrThrow({ where: { id: "crew-assignment-main-1" } }),
      prisma.statusHistory.findUniqueOrThrow({ where: { id: "report-history-main-1" } }),
      prisma.workOrderStatusHistory.findUniqueOrThrow({ where: { id: "work-order-history-main-1" } }),
    ])

    const preservedAttachmentId = `${PREFIX}seed-preserved-attachment`
    const preservedReportVoteId = `${PREFIX}seed-preserved-report-vote`
    const preservedSuggestionVoteId = `${PREFIX}seed-preserved-suggestion-vote`
    const mutationDate = new Date("2026-08-12T19:30:00.000Z")

    try {
      const mutatedUser = await prisma.user.update({
        where: { id: originalUser.id },
        data: {
          name: "Preserved Citizen",
          phone: `${PREFIX}phone`,
          passwordHash: `${PREFIX}preserved-auth-material`,
          avatarUrl: "/preserved-avatar.jpg",
        },
      })
      const mutatedReport = await prisma.report.update({
        where: { id: originalReport.id },
        data: {
          authorId: IDS.citizen,
          status: ReportStatus.RESOLVED,
          severity: ReportSeverity.LOW,
          importedVoteBaseline: 77,
        },
      })
      const mutatedSuggestion = await prisma.suggestion.update({
        where: { id: originalSuggestion.id },
        data: { status: SuggestionStatus.APPROVED, importedVoteBaseline: 21 },
      })
      const mutatedWorkOrder = await prisma.workOrder.update({
        where: { id: originalWorkOrder.id },
        data: {
          status: WorkOrderStatus.COMPLETED,
          priority: WorkOrderPriority.LOW,
          completedAt: mutationDate,
        },
      })
      const mutatedAssignment = await prisma.crewAssignment.update({
        where: { id: originalAssignment.id },
        data: { assignedById: IDS.manager, assignedAt: mutationDate },
      })
      const mutatedReportHistory = await prisma.statusHistory.update({
        where: { id: originalReportHistory.id },
        data: { note: "Preserved report history" },
      })
      const mutatedWorkOrderHistory = await prisma.workOrderStatusHistory.update({
        where: { id: originalWorkOrderHistory.id },
        data: { note: "Preserved work-order history" },
      })

      await prisma.attachment.create({
        data: {
          id: preservedAttachmentId,
          reportId: "main-1",
          workOrderId: "work-order-main-1",
          workOrderReportId: "main-1",
          uploadedById: IDS.crew,
          name: "preserved-evidence.jpg",
          mimeType: "image/jpeg",
          url: "data:image/jpeg;base64,phase2a-preserved-evidence",
          kind: AttachmentKind.COMPLETION_EVIDENCE,
        },
      })
      await prisma.vote.create({
        data: { id: preservedReportVoteId, reportId: "main-1", userId: IDS.citizen },
      })
      await prisma.suggestionVote.create({
        data: { id: preservedSuggestionVoteId, suggestionId: "suggestion-main-1", userId: IDS.citizen },
      })

      const countsBeforeSecondSeed = await databaseRowCounts()
      await seedDatabase(prisma)

      const [
        userAfterSeed,
        reportAfterSeed,
        suggestionAfterSeed,
        workOrderAfterSeed,
        assignmentAfterSeed,
        reportHistoryAfterSeed,
        workOrderHistoryAfterSeed,
      ] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: originalUser.id } }),
        prisma.report.findUniqueOrThrow({ where: { id: originalReport.id } }),
        prisma.suggestion.findUniqueOrThrow({ where: { id: originalSuggestion.id } }),
        prisma.workOrder.findUniqueOrThrow({ where: { id: originalWorkOrder.id } }),
        prisma.crewAssignment.findUniqueOrThrow({ where: { id: originalAssignment.id } }),
        prisma.statusHistory.findUniqueOrThrow({ where: { id: originalReportHistory.id } }),
        prisma.workOrderStatusHistory.findUniqueOrThrow({ where: { id: originalWorkOrderHistory.id } }),
      ])

      expect(userAfterSeed).toEqual(mutatedUser)
      expect(reportAfterSeed).toEqual(mutatedReport)
      expect(suggestionAfterSeed).toEqual(mutatedSuggestion)
      expect(workOrderAfterSeed).toEqual(mutatedWorkOrder)
      expect(assignmentAfterSeed).toEqual(mutatedAssignment)
      expect(reportHistoryAfterSeed).toEqual(mutatedReportHistory)
      expect(workOrderHistoryAfterSeed).toEqual(mutatedWorkOrderHistory)
      expect(await prisma.attachment.count({ where: { id: preservedAttachmentId } })).toBe(1)
      expect(await prisma.vote.count({ where: { id: preservedReportVoteId } })).toBe(1)
      expect(await prisma.suggestionVote.count({ where: { id: preservedSuggestionVoteId } })).toBe(1)
      expect(await databaseRowCounts()).toEqual(countsBeforeSecondSeed)
    } finally {
      await prisma.attachment.deleteMany({ where: { id: preservedAttachmentId } })
      await prisma.vote.deleteMany({ where: { id: preservedReportVoteId } })
      await prisma.suggestionVote.deleteMany({ where: { id: preservedSuggestionVoteId } })
      await prisma.crewAssignment.update({
        where: { id: originalAssignment.id },
        data: withoutId(originalAssignment),
      })
      await prisma.statusHistory.update({
        where: { id: originalReportHistory.id },
        data: withoutId(originalReportHistory),
      })
      await prisma.workOrderStatusHistory.update({
        where: { id: originalWorkOrderHistory.id },
        data: withoutId(originalWorkOrderHistory),
      })
      await prisma.workOrder.update({
        where: { id: originalWorkOrder.id },
        data: withoutId(originalWorkOrder),
      })
      await prisma.suggestion.update({
        where: { id: originalSuggestion.id },
        data: withoutId(originalSuggestion),
      })
      await prisma.report.update({
        where: { id: originalReport.id },
        data: withoutId(originalReport),
      })
      await prisma.user.update({
        where: { id: originalUser.id },
        data: withoutId(originalUser),
      })
    }
  }, 120_000)
})
