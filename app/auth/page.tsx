import LoginScreen from "@/components/login-screen"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth/authorization"
import { roleHome } from "@/lib/auth/route-policy"

export default async function AuthPage({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string }>
}) {
    const user = await getCurrentUser()
    if (user) redirect(roleHome(user.role))
    const { mode } = await searchParams
    return <LoginScreen initialMode={mode} />
}
