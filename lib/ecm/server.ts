import "server-only"

import { requireApiRole } from "@/lib/auth/authorization"
import { auth } from "@/lib/auth/server"
import { prisma } from "@/lib/db/prisma"
import { cloudinaryArchiveDocumentStorage } from "./cloudinary"
import { createArchiveHttpHandlers } from "./http"
import { createPrismaArchiveRepository } from "./repository"
import { createArchiveService } from "./service"

const trustedOrigins = Array.isArray(auth.options.trustedOrigins)
  ? auth.options.trustedOrigins.filter((origin): origin is string => typeof origin === "string")
  : []

export const archiveHttpHandlers = createArchiveHttpHandlers({
  authorization: { requireManager: (headers) => requireApiRole("Manager", headers) },
  service: createArchiveService(createPrismaArchiveRepository(prisma), cloudinaryArchiveDocumentStorage),
  trustedOrigins,
})
