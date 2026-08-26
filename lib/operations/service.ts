import { randomUUID } from "node:crypto"
import {
  AttachmentKind,
  ReportStatus,
  WorkOrderPriority,
  WorkOrderStatus,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client"
import type { AuthenticatedMunicipalUser } from "../auth/authorization-core"

export type DashboardFilters = {
  from?: Date
  to?: Date
  districtId?: string
  category?: string
  status?: ReportStatus
  page: number
  pageSize: number
}

export class OperationsError extends Error {
  constructor(readonly code: "forbidden" | "not-found" | "conflict" | "invalid") {
    super("Municipal operation failed")
  }
}

function manager(user: AuthenticatedMunicipalUser) {
  if (user.role !== "Manager") throw new OperationsError("forbidden")
}

function crew(user: AuthenticatedMunicipalUser) {
  if (user.role !== "Crew") throw new OperationsError("forbidden")
}

const reportSelect = {
  id: true, title: true, description: true, category: true, status: true, severity: true,
  latitude: true, longitude: true, createdAt: true,
  district: { select: { id: true, name: true } },
  _count: { select: { votes: true, workOrders: true } },
} satisfies Prisma.ReportSelect

const workOrderInclude = {
  report: { select: reportSelect },
  crewAssignments: { include: { crewUser: { select: { id: true, name: true, employeeId: true } } } },
  attachments: { where: { kind: AttachmentKind.COMPLETION_EVIDENCE }, orderBy: { createdAt: "asc" } },
  statusHistory: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { actor: { select: { id: true, name: true } } } },
} satisfies Prisma.WorkOrderInclude

type DashboardReport = Prisma.ReportGetPayload<{ select: typeof reportSelect }>
type DashboardWorkOrder = Prisma.WorkOrderGetPayload<{ include: typeof workOrderInclude }>

function serializeReport(report: DashboardReport) {
  return {
    id: report.id, title: report.title, description: report.description, category: report.category,
    status: report.status.toLowerCase().replace("_", "-"), severity: report.severity?.toLowerCase() ?? null,
    district: report.district, location: { lat: report.latitude, lng: report.longitude },
    createdAt: report.createdAt.toISOString(), votes: report._count.votes, workOrderCount: report._count.workOrders,
  }
}

function serializeWorkOrder(order: DashboardWorkOrder) {
  return {
    id: order.id, title: order.title, description: order.description, priority: order.priority.toLowerCase(),
    status: order.status.toLowerCase(), locationText: order.locationText, startedAt: order.startedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null, createdAt: order.createdAt.toISOString(),
    report: serializeReport(order.report),
    crew: order.crewAssignments.map((assignment) => ({ id: assignment.crewUser.id, name: assignment.crewUser.name, employeeId: assignment.crewUser.employeeId })),
    evidence: order.attachments.map((attachment) => ({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, url: attachment.url, createdAt: attachment.createdAt.toISOString() })),
    history: order.statusHistory.map((history) => ({ id: history.id, fromStatus: history.fromStatus?.toLowerCase() ?? null, toStatus: history.toStatus.toLowerCase(), note: history.note, createdAt: history.createdAt.toISOString(), actor: history.actor?.name ?? "Municipal staff" })),
  }
}

export function createOperationsService(database: PrismaClient) {
  return {
    async dashboard(user: AuthenticatedMunicipalUser, filters: DashboardFilters) {
      manager(user)
      const where = {
        ...(filters.districtId ? { districtId: filters.districtId } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
      }
      const [total, reports, statusRows, categoryRows, activeOrders, completedOrders] = await Promise.all([
        database.report.count({ where }),
        database.report.findMany({ where, select: reportSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
        database.report.groupBy({ by: ["status"], where, _count: { id: true }, orderBy: { status: "asc" } }),
        database.report.groupBy({ by: ["category"], where, _count: { id: true }, orderBy: { _count: { category: "desc" } }, take: 12 }),
        database.workOrder.count({ where: { status: { in: [WorkOrderStatus.PENDING, WorkOrderStatus.ACTIVE] } } }),
        database.workOrder.count({ where: { status: WorkOrderStatus.COMPLETED } }),
      ])
      return {
        cards: { totalReports: total, pending: statusRows.find((row) => row.status === ReportStatus.PENDING)?._count.id ?? 0, inProgress: statusRows.find((row) => row.status === ReportStatus.IN_PROGRESS)?._count.id ?? 0, resolved: statusRows.find((row) => row.status === ReportStatus.RESOLVED)?._count.id ?? 0, activeWorkOrders: activeOrders, completedWorkOrders: completedOrders },
        statusChart: statusRows.map((row) => ({ name: row.status.toLowerCase().replace("_", "-"), value: row._count.id })),
        categoryChart: categoryRows.map((row) => ({ name: row.category, value: row._count.id })),
        reports: reports.map(serializeReport), total, page: filters.page, pageSize: filters.pageSize, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
        mapReports: reports.map(serializeReport),
        districts: await database.district.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        categories: (await database.report.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } })).map((row) => row.category),
      }
    },

    async managerWorkOrders(user: AuthenticatedMunicipalUser) {
      manager(user)
      const [orders, crews, reports] = await Promise.all([
        database.workOrder.findMany({ include: workOrderInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }),
        database.user.findMany({ where: { role: "Crew", isActive: true }, select: { id: true, name: true, employeeId: true }, orderBy: { name: "asc" } }),
        database.report.findMany({ where: { status: { in: [ReportStatus.PENDING, ReportStatus.IN_PROGRESS] } }, select: reportSelect, orderBy: { createdAt: "desc" } }),
      ])
      return { workOrders: orders.map(serializeWorkOrder), crews, reports: reports.map(serializeReport) }
    },

    async createWorkOrder(user: AuthenticatedMunicipalUser, input: { reportId: string; title: string; description: string; priority: WorkOrderPriority; crewIds: string[] }) {
      manager(user)
      return database.$transaction(async (tx) => {
        const report = await tx.report.findUnique({ where: { id: input.reportId }, select: { id: true, status: true, district: { select: { name: true } } } })
        if (!report) throw new OperationsError("not-found")
        if (report.status === ReportStatus.RESOLVED) throw new OperationsError("conflict")
        const selectedCrew = await tx.user.findMany({ where: { id: { in: input.crewIds }, role: "Crew", isActive: true }, select: { id: true } })
        if (selectedCrew.length !== input.crewIds.length) throw new OperationsError("invalid")
        const order = await tx.workOrder.create({ data: { id: randomUUID(), reportId: report.id, createdById: user.id, title: input.title, description: input.description, priority: input.priority, locationText: report.district.name, crewAssignments: { create: selectedCrew.map((member) => ({ id: randomUUID(), crewUserId: member.id, assignedById: user.id })) }, statusHistory: { create: { id: randomUUID(), actorId: user.id, toStatus: WorkOrderStatus.PENDING, note: "Work order created and assigned" } } }, include: workOrderInclude })
        if (report.status === ReportStatus.PENDING) await tx.report.update({ where: { id: report.id }, data: { status: ReportStatus.IN_PROGRESS, statusHistory: { create: { id: randomUUID(), actorId: user.id, fromStatus: ReportStatus.PENDING, toStatus: ReportStatus.IN_PROGRESS, note: "Work order created" } } } })
        await tx.auditLog.create({ data: { id: randomUUID(), actorId: user.id, action: "work-order-created", entityType: "work-order", entityId: order.id, metadata: { reportId: report.id } } })
        return serializeWorkOrder(order)
      })
    },

    async updateWorkOrder(user: AuthenticatedMunicipalUser, id: string, input: { priority?: WorkOrderPriority; crewIds?: string[] }) {
      manager(user)
      return database.$transaction(async (tx) => {
        const current = await tx.workOrder.findUnique({ where: { id }, select: { id: true } })
        if (!current) throw new OperationsError("not-found")
        if (input.crewIds) {
          const crewMembers = await tx.user.findMany({ where: { id: { in: input.crewIds }, role: "Crew", isActive: true }, select: { id: true } })
          if (crewMembers.length !== input.crewIds.length) throw new OperationsError("invalid")
          await tx.crewAssignment.deleteMany({ where: { workOrderId: id } })
          await tx.crewAssignment.createMany({ data: crewMembers.map((member) => ({ id: randomUUID(), workOrderId: id, crewUserId: member.id, assignedById: user.id })) })
        }
        const order = await tx.workOrder.update({ where: { id }, data: { ...(input.priority ? { priority: input.priority } : {}) }, include: workOrderInclude })
        await tx.auditLog.create({ data: { id: randomUUID(), actorId: user.id, action: "work-order-updated", entityType: "work-order", entityId: id } })
        return serializeWorkOrder(order)
      })
    },

    async crewWorkOrders(user: AuthenticatedMunicipalUser) {
      crew(user)
      const orders = await database.workOrder.findMany({ where: { crewAssignments: { some: { crewUserId: user.id } } }, include: workOrderInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] })
      return { workOrders: orders.map(serializeWorkOrder) }
    },

    async crewUpdate(user: AuthenticatedMunicipalUser, id: string, input: { status: WorkOrderStatus; note?: string }) {
      crew(user)
      return database.$transaction(async (tx) => {
        const current = await tx.workOrder.findFirst({ where: { id, crewAssignments: { some: { crewUserId: user.id } } }, select: { id: true, status: true } })
        if (!current) throw new OperationsError("not-found")
        if (current.status === WorkOrderStatus.COMPLETED && input.status !== WorkOrderStatus.COMPLETED) throw new OperationsError("conflict")
        if (input.status === WorkOrderStatus.COMPLETED && current.status === WorkOrderStatus.PENDING) throw new OperationsError("conflict")
        const order = await tx.workOrder.update({ where: { id }, data: { status: input.status, ...(input.status === WorkOrderStatus.ACTIVE && !current.status ? { startedAt: new Date() } : {}), ...(input.status === WorkOrderStatus.ACTIVE ? { startedAt: new Date() } : {}), ...(input.status === WorkOrderStatus.COMPLETED ? { completedAt: new Date() } : {}), statusHistory: { create: { id: randomUUID(), actorId: user.id, fromStatus: current.status, toStatus: input.status, note: input.note ?? null } } }, include: workOrderInclude })
        await tx.auditLog.create({ data: { id: randomUUID(), actorId: user.id, action: "work-order-status-updated", entityType: "work-order", entityId: id, metadata: { status: input.status } } })
        return serializeWorkOrder(order)
      })
    },

    async approveClosure(user: AuthenticatedMunicipalUser, reportId: string, note?: string) {
      manager(user)
      return database.$transaction(async (tx) => {
        const report = await tx.report.findUnique({ where: { id: reportId }, select: { id: true, status: true, workOrders: { select: { status: true } } } })
        if (!report) throw new OperationsError("not-found")
        if (report.status === ReportStatus.RESOLVED) throw new OperationsError("conflict")
        if (!report.workOrders.some((order) => order.status === WorkOrderStatus.COMPLETED)) throw new OperationsError("conflict")
        await tx.report.update({ where: { id: reportId }, data: { status: ReportStatus.RESOLVED, statusHistory: { create: { id: randomUUID(), actorId: user.id, fromStatus: report.status, toStatus: ReportStatus.RESOLVED, note: note ?? "Manager approved completion" } } } })
        await tx.auditLog.create({ data: { id: randomUUID(), actorId: user.id, action: "report-closure-approved", entityType: "report", entityId: reportId } })
        return { reportId, status: "resolved" }
      })
    },

    async addCompletionEvidence(user: AuthenticatedMunicipalUser, workOrderId: string, attachment: { name: string; mimeType: string; url: string }) {
      crew(user)
      const order = await database.workOrder.findFirst({ where: { id: workOrderId, crewAssignments: { some: { crewUserId: user.id } } }, select: { id: true, reportId: true } })
      if (!order) throw new OperationsError("not-found")
      const evidence = await database.attachment.create({ data: { id: randomUUID(), reportId: order.reportId, workOrderId: order.id, workOrderReportId: order.reportId, uploadedById: user.id, name: attachment.name, mimeType: attachment.mimeType, url: attachment.url, kind: AttachmentKind.COMPLETION_EVIDENCE } })
      return { id: evidence.id, name: evidence.name, mimeType: evidence.mimeType, url: evidence.url, createdAt: evidence.createdAt.toISOString() }
    },
  }
}

export type OperationsService = ReturnType<typeof createOperationsService>
