// 알림 소켓 훅: 계정 맞추기·소켓 받기 연결·끊기 (새 알림·ready는 notificationSocket/)
// 앱 루트(app/App.jsx)가 씀
import { useEffect } from "react"

import { useAuthStore } from "../../auth/store/auth.store.js"
import { useNotificationsStore } from "../store/notifications.store.js"
import { subscribeNotifications } from "../socket/notifications.socket.js"
import { createLiveHandler } from "./notificationSocket/liveNotification.js"
import { createReadySync } from "./notificationSocket/readySync.js"

// 시험이 이 경로로 가져다 씀
export { READY_MAX_ATTEMPTS } from "../constants/notificationReady.js"
export { __setNotificationTimersForTests } from "./notificationSocket/timers.js"

// 로그인 계정이 있고 소켓이 있을 때만 받기 시작함
export function useNotificationSocketEvents(socket) {
  const accountUuid = useAuthStore((state) =>
    state.isLoggedIn && state.user?.uuid ? state.user.uuid : null,
  )

  // 로그인 상태가 바뀔 때마다 알림 스토어 계정 맞춤
  useEffect(() => {
    useNotificationsStore.getState().syncAccount()
    return useAuthStore.subscribe(() => {
      useNotificationsStore.getState().syncAccount()
    })
  }, [])

  // 소켓·계정이 바뀔 때마다 받기를 새로 붙이고 이전 것은 정리
  useEffect(() => {
    if (!socket || accountUuid === null) return undefined

    const store = useNotificationsStore
    store.getState().syncAccount()

    // 스토어 계정이 지금 로그인 계정과 다르면 받지 않음
    const accountId = store.getState().accountId
    const accountGeneration = store.getState().accountGeneration
    if (accountId !== accountUuid) return undefined

    let cancelled = false

    // 정리됐거나 계정 세대가 바뀌었으면 지난 연결로 봄
    const accountAlive = () =>
      !cancelled && store.getState().accountGeneration === accountGeneration

    const ready = createReadySync(socket, store, accountAlive)
    const off = subscribeNotifications(socket, {
      created: createLiveHandler(store, accountId, accountAlive),
      connect: ready.connect,
      disconnect: ready.disconnect,
    })

    // 복원은 바로 시작, ready는 연결돼 있을 때만 보냄
    ready.start({ connected: socket.connected !== false })

    // 정리 때 늦게 온 결과가 안 들어가게 막고 받기 끊음
    return () => {
      cancelled = true
      ready.teardown()
      off()
    }
  }, [socket, accountUuid])
}
