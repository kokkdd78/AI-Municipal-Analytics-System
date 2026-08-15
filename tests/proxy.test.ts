import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { proxy } from "../proxy"

function request(pathname: string, cookie?: string) {
  return new NextRequest(`https://municipal.example.test${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  })
}

describe("Next.js optimistic authentication Proxy", () => {
  it("redirects protected pages without a session cookie", () => {
    const response = proxy(request("/report/track/report-1"))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://municipal.example.test/auth?callback=%2Freport%2Ftrack%2Freport-1",
    )
  })

  it("uses cookie presence only and leaves stale or forged cookies for live page authorization", () => {
    const response = proxy(request("/manager", "better-auth.session_token=forged-or-stale"))

    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("does not gate public or prefix-lookalike pages", () => {
    expect(proxy(request("/auth")).headers.get("x-middleware-next")).toBe("1")
    expect(proxy(request("/manager-tools")).headers.get("x-middleware-next")).toBe("1")
  })
})
