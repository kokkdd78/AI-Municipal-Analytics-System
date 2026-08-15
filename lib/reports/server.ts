import "server-only"

import { requireApiAnyRole, requireApiRole } from "@/lib/auth/authorization"
import { auth } from "@/lib/auth/server"
import { prisma } from "@/lib/db/prisma"
import { createReportHttpHandlers } from "./http"
import { createPrismaReportRepository } from "./repository"
import { createReportService } from "./service"

const reportRepository = createPrismaReportRepository(prisma)
const reportService = createReportService(reportRepository)
const trustedOrigins = Array.isArray(auth.options.trustedOrigins)
  ? auth.options.trustedOrigins.filter((origin): origin is string => typeof origin === "string")
  : []

export const reportHttpHandlers = createReportHttpHandlers({
  authorization: {
    requireRole: (role, headers) => requireApiRole(role, headers),
    requireAnyRole: (roles, headers) => requireApiAnyRole(roles, headers),
  },
  service: reportService,
  trustedOrigins,
})
