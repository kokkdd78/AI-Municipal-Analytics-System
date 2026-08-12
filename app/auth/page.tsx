import LoginScreen from "@/components/login-screen"

export default async function AuthPage({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string }>
}) {
    const { mode } = await searchParams
    return <LoginScreen initialMode={mode} />
}
