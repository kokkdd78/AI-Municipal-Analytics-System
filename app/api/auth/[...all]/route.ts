import { prisma } from "@/lib/db/prisma"
import { createMunicipalAuthHttpHandlers, type AuthRouteContext } from "@/lib/auth/http-handlers"
import { auth } from "@/lib/auth/server"

const municipalAuth = createMunicipalAuthHttpHandlers({ auth, database: prisma })

export function GET(request: Request, context: AuthRouteContext) {
  return municipalAuth.handle(request, context)
}

export function POST(request: Request, context: AuthRouteContext) {
  return municipalAuth.handle(request, context)
}

export function PATCH(request: Request, context: AuthRouteContext) {
  return municipalAuth.handle(request, context)
}

export function PUT(request: Request, context: AuthRouteContext) {
  return municipalAuth.handle(request, context)
}

export function DELETE(request: Request, context: AuthRouteContext) {
  return municipalAuth.handle(request, context)
}
