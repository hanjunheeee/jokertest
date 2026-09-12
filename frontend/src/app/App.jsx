import { useEffect } from "react"
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/routes/index"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { getMeApi } from "@/domains/auth/api/auth.api"
import { useFriendSocketEvents } from "@/domains/lobby/hooks/useFriendSocketEvents"
import { useSocket } from "@/shared/hooks/useSocket"
import { useSettingsStore } from "@/domains/settings/store/settingsStore.js"
import { syncAppTextScale } from "@/app/appTextScale.js"

// sessionStorage는 리로드 시 유지, 탭/브라우저 종료 시 초기화 → 리로드 여부 판별에 사용
const RELOAD_FLAG = 'app:was_reload'

export default function App() {
    const socket = useSocket()
    useFriendSocketEvents(socket)

    // F-15(AC-02): "텍스트 크기" 설정을 --app-text-scale로 반영한다. index.css의
    // .app-text-scalable을 쓰는 요소만 이 배율을 적용받으므로 레이아웃 전체가 확대되지
    // 않는다.
    const generalTextSize = useSettingsStore((s) => s.generalTextSize)
    useEffect(() => {
        syncAppTextScale(generalTextSize)
    }, [generalTextSize])

    // 앱이 처음 켜졌을 때(새로고침이 아닐 때만) 로그인 상태를 서버 쿠키로 재검증합니다.
    // accessToken 쿠키는 세션 쿠키(만료시간 없음)라 브라우저를 완전히 껐다 켜면 사라지는데,
    // localStorage의 isLoggedIn은 계속 남아있어서 이 재검증이 없으면 쿠키 없이도
    // ProtectedRoute를 통과하는 상태가 생깁니다.
    useEffect(() => {
        const { isLoggedIn } = useAuthStore.getState()

        const wasReload = sessionStorage.getItem(RELOAD_FLAG) === '1'
        sessionStorage.removeItem(RELOAD_FLAG)

        if (isLoggedIn && !wasReload) {
            getMeApi().catch(() => {
                useAuthStore.getState().logout()
            })
        }

        const handleBeforeUnload = () => {
            sessionStorage.setItem(RELOAD_FLAG, '1')
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [])

    return <RouterProvider router={router} />
}
