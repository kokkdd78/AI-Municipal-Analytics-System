import "server-only"

import { requireApiAnyRole, requireApiRole } from "../auth/authorization"
import { auth } from "../auth/server"
import { prisma } from "../db/prisma"
import { createSuggestionHttpHandlers } from "./http"
import { createPrismaSuggestionRepository } from "./repository"
import { createSuggestionService } from "./service"

const repository = createPrismaSuggestionRepository(prisma)
const service = createSuggestionService(repository)
const trustedOrigins = Array.isArray(auth.options.trustedOrigins)
  ? auth.options.trustedOrigins.filter((origin): origin is string => typeof origin === "string")
  : []

export const suggestionHttpHandlers = createSuggestionHttpHandlers({
  authorization: {
    requireRole: (role, headers) => requireApiRole(role, headers),
    requireAnyRole: (roles, headers) => requireApiAnyRole(roles, headers),
  },
  service,
  trustedOrigins,
})
