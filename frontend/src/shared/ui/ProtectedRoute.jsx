import { useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import {
    selectIsAuthenticated,
    selectLoggedOutIntentionally,
    useAuthStore,
} from "@/domains/auth/store/auth.store"
import { useGameSessionSocketEvents } from "@/domains/game/ingame/hooks/useGameSessionSocketEvents"
// F-21(A-10): 전적 커밋 이후의 개인 무효화와 재진입·재연결·창 재활성화 재조회가 실제로 닿는
// 세 store를 여기서 꽂는다. 수신기가 이 store들을 직접 import하지 않는 이유는
// accountCacheRefresh.js의 주석에 있다(그러면 수신기가 플레인 Node에서 로드되지 않는다).
import { registerAccountCacheStores } from "@/domains/user/utils/accountCacheRefresh.js"
import { useUserProfileStore } from "@/domains/user/store/user.store"
import { useEconomyStore } from "@/domains/economy/store/economy.store"
import { useAchievementsStore } from "@/domains/library/store/achievements.store"

// 앱이 이 모듈을 로드하는 순간(=보호 라우트가 존재하는 순간) 한 번 등록한다. 어댑터가 얇은
// 이유는 각 store의 기존 계약(계정 세대·조회 순서·합치기)을 그대로 두기 위함이다.
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

// 로그인한 사용자만 통과시켜야 하는 라우트를 감싸는 컴포넌트입니다.
export default function ProtectedRoute() {
    // 로그인 여부입니다. true면 보호된 페이지를 보여줄 수 있습니다.
    const isAuthenticated = useAuthStore(selectIsAuthenticated)

    // 사용자가 직접 로그아웃해서 로그인 페이지로 온 상황인지 구분하는 값입니다.
    const loggedOutIntentionally = useAuthStore(selectLoggedOutIntentionally)

    // GameSession 종료(game_ended) 구독입니다. /multiplay, /game-matching, /ingame,
    // /gameresult 등 이 컴포넌트가 감싸는 모든 라우트 사이를 이동해도 리마운트되지
    // 않아 이벤트 유실 구간이 생기지 않습니다. 로그인하지 않은 상태(socket이 아직
    // 없음)에서는 훅 내부에서 즉시 return하므로 안전합니다.
    useGameSessionSocketEvents()

    useEffect(() => {
        // 이미 로그인된 상태면 경고를 띄울 필요가 없습니다.
        if (isAuthenticated) return

        // 사용자가 직접 로그아웃한 경우에는 자연스럽게 로그인 페이지로 보내고 경고는 띄우지 않습니다.
        if (loggedOutIntentionally) return

        // alert 같은 동작은 화면을 그리는 중에 실행하지 않고, 렌더가 끝난 뒤 useEffect에서 실행합니다.
        alert("로그인이 필요한 페이지입니다!")
    }, [isAuthenticated, loggedOutIntentionally])

    if (!isAuthenticated) {
        // 로그인하지 않았다면 로그인 페이지로 보냅니다.
        // replace는 뒤로가기를 눌렀을 때 보호된 페이지와 로그인 페이지를 반복하지 않게 합니다.
        return <Navigate to="/login" replace />
    }

    // 인증을 통과하면 이 위치에 실제 자식 라우트가 렌더링됩니다.
    // 예: 로비, 게임 화면 등 ProtectedRoute 아래에 선언된 페이지들입니다.
    return <Outlet />
}
