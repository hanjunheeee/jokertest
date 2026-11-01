// 앱 조립: 데스크톱 App과 같은 소켓·친구/알림 이벤트·글자 배율·효과음·세션 시작, 라우터만 모바일 것
// main.jsx가 그림
import { useEffect } from "react"
import { RouterProvider } from "react-router-dom"
import { router } from "@m/app/routes/index"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { getMeApi } from "@/domains/auth/api/auth.api"
import { getMyProfileApi } from "@/domains/user/api/user.api"
import { bootstrapSession } from "@/domains/auth/utils/bootstrapSession.js"
import { useFriendSocketEvents } from "@/domains/lobby/hooks/useFriendSocketEvents"
import { useNotificationSocketEvents } from "@/domains/notifications/hooks/useNotificationSocketEvents.js"
import { useSocket } from "@/shared/hooks/useSocket"
import { useAppTextScaleSync } from "@/app/useAppTextScaleSync.js"
import { useSfxRuntime } from "@/shared/hooks/useSfxRuntime.js"
import GlobalBgmLayer from "@/shared/ui/GlobalBgmLayer.jsx"

export default function App() {
    // 로그인 동안 앱 전체에 소켓 하나 (한 계정 한 소켓은 서버가 지킴)
    const socket = useSocket()
    useFriendSocketEvents(socket, { navigate: (path) => router.navigate(path) })

    useNotificationSocketEvents(socket)

    useAppTextScaleSync()

    useSfxRuntime()

    // 새로고침해도 쿠키로 로그인 상태 되살리기
    useEffect(() => {
        bootstrapSession({ getMe: getMeApi, getMyProfile: getMyProfileApi, store: useAuthStore })
    }, [])

    return (
        <>
            <GlobalBgmLayer />
            <RouterProvider router={router} />
        </>
    )
}
