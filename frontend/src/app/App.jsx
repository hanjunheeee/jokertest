import { useEffect } from "react"
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/routes/index"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { getMeApi } from "@/domains/auth/api/auth.api"
import { useFriendSocketEvents } from "@/domains/lobby/hooks/useFriendSocketEvents"
import { useSocket } from "@/shared/hooks/useSocket"
import { useAppTextScaleSync } from "@/app/useAppTextScaleSync.js"
import { useSfxRuntime } from "@/shared/hooks/useSfxRuntime.js"

// sessionStorage는 리로드 시 유지, 탭/브라우저 종료 시 초기화 → 리로드 여부 판별에 사용
const RELOAD_FLAG = 'app:was_reload'

export default function App() {
    const socket = useSocket()
    useFriendSocketEvents(socket)

    // F-15(AC-02): "텍스트 크기" 설정을 --app-text-scale로 반영한다. 이 변수는 font-size
    // 선언에서만 곱해진다(index.css의 body 기본값 + 자체 font-size를 지정하는 요소가 쓰는
    // .app-text-scaled) — 간격·프레임은 rem·%·cqi 기준이라 레이아웃 전체가 확대되지 않는다.
    useAppTextScaleSync()

    // F-16(AC-01/AC-04): 공통 효과음 재생기를 앱 수명 하나로 유지한다. 라우터 위에서 한 번만
    // 호출해야 화면 전환으로 재생기가 재생성되지 않고, 그래야 "같은 사건을 두 번 재생하지
    // 않는다"는 처리 표식이 활성 범위 내내 살아 있는다. 실제 사건 dispatch는 각 producer의
    // 수신 경계(useFriendSocketEvents·useMatchingRoom·useGameSessionSocketEvents)가 하고,
    // 일반 버튼/링크 클릭은 이 훅이 설치하는 document capture 단일 소유자가 처리한다.
    // 이 훅은 BGM을 켜지 않는다 — 음악 차단(MUSIC_PLAYBACK_ENABLED)은 그대로다.
    useSfxRuntime()

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
