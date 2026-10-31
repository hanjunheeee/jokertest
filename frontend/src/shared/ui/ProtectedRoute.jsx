import { useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import {
    selectIsAuthenticated,
    selectLoggedOutIntentionally,
    useAuthStore,
} from "@/domains/auth/store/auth.store"
import { useGameSessionSocketEvents } from "@/domains/game/ingame/hooks/useGameSessionSocketEvents"
import { registerAccountCacheStores } from "@/domains/user/utils/accountCacheRefresh.js"
import { useUserProfileStore } from "@/domains/user/store/user.store"
import { useEconomyStore } from "@/domains/economy/store/economy.store"
import { useAchievementsStore } from "@/domains/library/store/achievements.store"
import { resolveProtectedRouteState } from "@/domains/auth/utils/bootstrapSession.js"

registerAccountCacheStores({
    profile: {
        invalidate: () => useUserProfileStore.getState().invalidate(),
        refresh: () => useUserProfileStore.getState().refresh(),
    },
    economy: {
        fetch: () => useEconomyStore.getState().fetchSummary(),
        isLoading: () => useEconomyStore.getState().status === "loading",
    },
    achievements: {
        fetch: () => useAchievementsStore.getState().fetchAchievements(),
        isLoading: () => useAchievementsStore.getState().status === "loading",
    },
})

export default function ProtectedRoute() {
    const isAuthenticated = useAuthStore(selectIsAuthenticated)

    const loggedOutIntentionally = useAuthStore(selectLoggedOutIntentionally)

    const sessionBootstrap = useAuthStore((state) => state.sessionBootstrap)
    const routeState = resolveProtectedRouteState({ isAuthenticated, sessionBootstrap })

    useGameSessionSocketEvents()

    useEffect(() => {
        if (routeState !== "redirect") return

        if (loggedOutIntentionally) return

        alert("로그인이 필요한 페이지입니다!")
    }, [routeState, loggedOutIntentionally])

    if (routeState === "pending") return null

    if (routeState === "redirect") {
        return <Navigate to="/login" replace />
    }

    return <Outlet />
}
