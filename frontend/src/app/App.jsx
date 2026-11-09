// 앱 맨 바깥 틀: 소켓·친구·알림 받기와 글자 크기·효과음을 한 번만 켬
// main.jsx(데스크톱)가 씀, 라우터 그리기 전에 세션 확인 중 표시부터 둠
import { useEffect, useState } from "react"
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/routes/index"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { getMeApi } from "@/domains/auth/api/auth.api"
import { getMyProfileApi } from "@/domains/user/api/user.api"
import { bootstrapSession } from "@/domains/auth/utils/bootstrapSession.js"
import { markSessionCheckPending } from "@/app/sessionCheckGate.js"
import { useFriendSocketEvents } from "@/domains/lobby/hooks/useFriendSocketEvents"
import { useNotificationSocketEvents } from "@/domains/notifications/hooks/useNotificationSocketEvents.js"
import { useSocket } from "@/shared/hooks/useSocket"
import { useAppTextScaleSync } from "@/app/useAppTextScaleSync.js"
import { useSfxRuntime } from "@/shared/hooks/useSfxRuntime.js"
import GlobalBgmLayer from "@/shared/ui/GlobalBgmLayer.jsx"
// 약관 재동의 창·새 버전 안내 띠 (라우터 바깥에 한 번만)
import TermsReconsentGate from "@/domains/auth/components/terms/TermsReconsentGate.jsx"
import AppUpdateNotice from "@/shared/ui/AppUpdateNotice.jsx"

export default function App() {
    // 라우터가 그려지기 전에 세션 확인 중으로 둠 (FE-010)
    useState(() => markSessionCheckPending())

    const socket = useSocket()
    useFriendSocketEvents(socket, { navigate: (path) => router.navigate(path) })

    useNotificationSocketEvents(socket)

    useAppTextScaleSync()

    useSfxRuntime()

    useEffect(() => {
        bootstrapSession({ getMe: getMeApi, getMyProfile: getMyProfileApi, store: useAuthStore })
    }, [])

    return (
        <>
            <GlobalBgmLayer />
            <RouterProvider router={router} />
            <TermsReconsentGate />
            <AppUpdateNotice router={router} />
        </>
    )
}
