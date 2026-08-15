import "server-only"

import { requireApiRole } from "../auth/authorization"
import { auth } from "../auth/server"
import { cloudinaryReportImageStorage } from "./cloudinary"
import { prisma } from "../db/prisma"
import { createReportImageHttpHandlers } from "./http"
import { createPrismaReportImageRepository } from "./repository"
import { createReportImageService } from "./service"

const repository = createPrismaReportImageRepository(prisma)
const service = createReportImageService(repository, cloudinaryReportImageStorage)
const trustedOrigins = Array.isArray(auth.options.trustedOrigins)
  ? auth.options.trustedOrigins.filter((origin): origin is string => typeof origin === "string")
  : []

export const reportImageHttpHandlers = createReportImageHttpHandlers({
  authorization: { requireRole: (role, headers) => requireApiRole(role, headers) },
  service,
  trustedOrigins,
})
