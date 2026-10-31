import { useEffect } from "react"
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/routes/index"
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
        </>
    )
}
