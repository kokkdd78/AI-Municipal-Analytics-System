import "server-only"

import { requireApiRole } from "@/lib/auth/authorization"
import { auth } from "@/lib/auth/server"
import { prisma } from "@/lib/db/prisma"

import { createReportAssistanceHttpHandlers } from "./http"
import { createGeminiReportAssistanceProvider } from "./provider"
import { createPrismaReportAssistanceRepository } from "./repository"
import { createReportAssistanceService } from "./service"

const trustedOrigins = Array.isArray(auth.options.trustedOrigins)
  ? auth.options.trustedOrigins.filter((origin): origin is string => typeof origin === "string")
  : []

export const reportAssistanceHttpHandlers = createReportAssistanceHttpHandlers({
  authorization: { requireRole: (role, headers) => requireApiRole(role, headers) },
  service: createReportAssistanceService(
    createPrismaReportAssistanceRepository(prisma),
    createGeminiReportAssistanceProvider(),
  ),
  trustedOrigins,
})
