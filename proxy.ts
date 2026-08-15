import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"

import { requiredRoleForPage } from "./lib/auth/route-policy"

export function proxy(request: NextRequest) {
  if (!requiredRoleForPage(request.nextUrl.pathname)) return NextResponse.next()
  if (getSessionCookie(request)) return NextResponse.next()

  const destination = new URL("/auth", request.url)
  destination.searchParams.set("callback", request.nextUrl.pathname)
  return NextResponse.redirect(destination)
}

export const config = {
  matcher: [
    "/citizen-app/:path*",
    "/map/:path*",
    "/my-reports/:path*",
    "/report/:path*",
    "/report-success/:path*",
    "/manager/:path*",
    "/crew/:path*",
  ],
}
