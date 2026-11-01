// 로그인해야 들어가는 화면 묶음의 문지기 (세션 확인 중엔 빈 화면, 미로그인이면 /login)
// app/routes/index.jsx가 로그인 필요 경로들의 부모로 씀
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

// 계정 캐시 새로고침이 부를 프로필·재화·업적 스토어를 한 번 등록 (accountCacheRefresh가 직접 안 불러오게)
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

// 판 진행 소켓 이벤트도 로그인 화면 전체에서 받음
export default function ProtectedRoute() {
    const isAuthenticated = useAuthStore(selectIsAuthenticated)

    const loggedOutIntentionally = useAuthStore(selectLoggedOutIntentionally)

    const sessionBootstrap = useAuthStore((state) => state.sessionBootstrap)
    const routeState = resolveProtectedRouteState({ isAuthenticated, sessionBootstrap })

    useGameSessionSocketEvents()

    useEffect(() => {
        // 일부러 로그아웃한 게 아닐 때만 로그인 필요 알림
        if (routeState !== "redirect") return

        if (loggedOutIntentionally) return

        alert("로그인이 필요한 페이지입니다!")
    }, [routeState, loggedOutIntentionally])

    // 세션 확인 전에 /login으로 튕기지 않게 아무것도 안 그림
    if (routeState === "pending") return null

    // 뒤로 가기로 못 돌아오게 replace로 /login
    if (routeState === "redirect") {
        return <Navigate to="/login" replace />
    }

    return <Outlet />
}
