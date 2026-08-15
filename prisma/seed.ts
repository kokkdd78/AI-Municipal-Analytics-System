import "dotenv/config"

import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { PrismaNeon } from "@prisma/adapter-neon"

import { JEDDAH_DISTRICTS } from "../constants/districts"
import { deriveExistingUserAuthEmail } from "../lib/auth/identifiers"
import {
  PrismaClient,
  ReportSeverity,
  ReportStatus,
  SuggestionStatus,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from "../generated/prisma/client"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url"

const SEED_DATE = new Date("2026-08-12T12:00:00.000Z")

export interface SeedResult {
  districts: number
  departments: number
  users: number
  reports: number
  suggestions: number
  workOrders: number
}

function seedConnectionString(): string {
  if (process.argv.includes("--test")) return requireSafeTestDatabaseUrl()

  const directUrl = process.env.DIRECT_URL?.trim()
  if (!directUrl) throw new Error("DIRECT_URL is required")
  return directUrl
}

function createSeedClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString: seedConnectionString() }),
  })
}

async function seedDistricts(database: PrismaClient): Promise<void> {
  await database.district.createMany({
    data: JEDDAH_DISTRICTS.map((district) => ({
      id: district.id,
      name: district.name,
      arabicName: district.arabic,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    })),
    skipDuplicates: true,
  })
}

async function seedDepartments(database: PrismaClient): Promise<void> {
  await database.department.createMany({
    data: [
      {
        id: "department-roads",
        name: "Road Maintenance",
        description: "Road, sidewalk, and pothole maintenance",
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      },
      {
        id: "department-lighting",
        name: "Public Lighting",
        description: "Streetlight inspection and repair",
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      },
      {
        id: "department-sanitation",
        name: "Sanitation",
        description: "Waste collection and public-space cleaning",
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })
}

async function seedUsers(database: PrismaClient): Promise<void> {
  await database.user.createMany({
    data: [
      {
        id: "demo-citizen",
        name: "Ayman AlJenidi",
        authEmail: deriveExistingUserAuthEmail("demo-citizen"),
        role: UserRole.Citizen,
        avatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=Ayman",
        districtId: "al-naeem",
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      },
      {
        id: "demo-manager",
        name: "Fatimah",
        authEmail: deriveExistingUserAuthEmail("demo-manager"),
        role: UserRole.Manager,
        districtId: "al-naeem",
        departmentId: "department-roads",
        employeeId: "M-1024",
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      },
      {
        id: "demo-crew",
        name: "Khalid",
        authEmail: deriveExistingUserAuthEmail("demo-crew"),
        role: UserRole.Crew,
        districtId: "al-naeem",
        departmentId: "department-roads",
        employeeId: "C-402",
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })
}

async function seedReports(database: PrismaClient): Promise<void> {
  await database.report.createMany({
    data: [
      {
        id: "main-1",
        authorId: "demo-citizen",
        departmentId: "department-roads",
        districtId: "al-naeem",
        title: "Pothole on Main St",
        description: "A pothole needs municipal inspection.",
        category: "pothole",
        status: ReportStatus.PENDING,
        severity: ReportSeverity.HIGH,
        latitude: 21.6169,
        longitude: 39.1564,
        importedVoteBaseline: 12,
        createdAt: new Date("2026-08-10T08:00:00.000Z"),
        updatedAt: SEED_DATE,
      },
      {
        id: "main-2",
        authorId: "demo-citizen",
        departmentId: "department-lighting",
        districtId: "al-naeem",
        title: "Broken Streetlight",
        description: "A streetlight is not working after dark.",
        category: "lighting",
        status: ReportStatus.IN_PROGRESS,
        severity: ReportSeverity.MEDIUM,
        latitude: 21.618,
        longitude: 39.158,
        importedVoteBaseline: 8,
        createdAt: new Date("2026-08-09T18:30:00.000Z"),
        updatedAt: SEED_DATE,
      },
      {
        id: "main-3",
        authorId: "demo-citizen",
        departmentId: "department-sanitation",
        districtId: "al-naeem",
        title: "Trash Pile",
        description: "Waste has accumulated beside the road.",
        category: "trash",
        status: ReportStatus.RESOLVED,
        severity: ReportSeverity.LOW,
        latitude: 21.615,
        longitude: 39.155,
        importedVoteBaseline: 5,
        createdAt: new Date("2026-08-08T10:15:00.000Z"),
        updatedAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })
}

async function seedSuggestionAndOperations(database: PrismaClient): Promise<void> {
  await database.suggestion.createMany({
    data: [
      {
        id: "suggestion-main-1",
        authorId: "demo-citizen",
        districtId: "al-naeem",
        title: "New Park",
        description: "Add more green space for neighborhood residents.",
        category: "park",
        status: SuggestionStatus.UNDER_REVIEW,
        latitude: 21.62,
        longitude: 39.16,
        importedVoteBaseline: 0,
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })

  await database.workOrder.createMany({
    data: [
      {
        id: "work-order-main-1",
        reportId: "main-1",
        departmentId: "department-roads",
        createdById: "demo-manager",
        title: "Fill Pothole",
        description: "Inspect and repair the reported pothole.",
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.ACTIVE,
        locationText: "Main St, Al-Naeem",
        startedAt: SEED_DATE,
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })

  await database.crewAssignment.createMany({
    data: [
      {
        id: "crew-assignment-main-1",
        workOrderId: "work-order-main-1",
        crewUserId: "demo-crew",
        assignedById: "demo-manager",
        assignedAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })

  await database.statusHistory.createMany({
    data: [
      {
        id: "report-history-main-1",
        reportId: "main-1",
        actorId: "demo-manager",
        toStatus: ReportStatus.PENDING,
        note: "Report received by the system",
        createdAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })

  await database.workOrderStatusHistory.createMany({
    data: [
      {
        id: "work-order-history-main-1",
        workOrderId: "work-order-main-1",
        actorId: "demo-manager",
        fromStatus: WorkOrderStatus.PENDING,
        toStatus: WorkOrderStatus.ACTIVE,
        note: "Work order assigned to field crew",
        createdAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })

  await database.auditLog.createMany({
    data: [
      {
        id: "audit-main-1",
        actorId: "demo-manager",
        action: "WORK_ORDER_ASSIGNED",
        entityType: "WorkOrder",
        entityId: "work-order-main-1",
        metadata: { crewUserId: "demo-crew" },
        createdAt: SEED_DATE,
      },
    ],
    skipDuplicates: true,
  })
}

export async function seedDatabase(database: PrismaClient): Promise<SeedResult> {
  await seedDistricts(database)
  await seedDepartments(database)
  await seedUsers(database)
  await seedReports(database)
  await seedSuggestionAndOperations(database)

  const [districts, departments, users, reports, suggestions, workOrders] = await Promise.all([
    database.district.count(),
    database.department.count(),
    database.user.count(),
    database.report.count(),
    database.suggestion.count(),
    database.workOrder.count(),
  ])

  return { districts, departments, users, reports, suggestions, workOrders }
}

async function runCliSeed(): Promise<void> {
  const database = createSeedClient()

  try {
    console.log(JSON.stringify(await seedDatabase(database)))
  } finally {
    await database.$disconnect()
  }
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : null
if (entryPoint === fileURLToPath(import.meta.url)) {
  void runCliSeed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Database seed failed")
    process.exitCode = 1
  })
}
