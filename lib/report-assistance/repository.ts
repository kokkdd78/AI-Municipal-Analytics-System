import type { PrismaClient } from "@/generated/prisma/client"

export interface AssistanceCandidate {
  id: string
  title: string
  category: string
  description: string
  districtName: string
  latitude: number
  longitude: number
}

export interface ReportAssistanceRepository {
  districtExists(id: string): Promise<boolean>
  recentCandidates(districtId: string, limit: number): Promise<AssistanceCandidate[]>
}

export function createPrismaReportAssistanceRepository(database: PrismaClient): ReportAssistanceRepository {
  return {
    async districtExists(id) {
      return (await database.district.count({ where: { id } })) === 1
    },
    async recentCandidates(districtId, limit) {
      const records = await database.report.findMany({
        where: { districtId, createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000) } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          title: true,
          category: true,
          description: true,
          district: { select: { name: true } },
          latitude: true,
          longitude: true,
        },
      })
      return records.map(({ district, ...record }) => ({ ...record, districtName: district.name }))
    },
  }
}
