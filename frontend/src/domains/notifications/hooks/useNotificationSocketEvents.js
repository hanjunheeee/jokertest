// 알림 소켓 훅: 계정 맞추기·소켓 받기 연결·끊기
// 앱 루트가 씀, 받은 알림 처리는 notificationSocket/liveNotification.js, ready 동기화는 notificationSocket/readySync.js
import { useEffect } from "react"

import { useAuthStore } from "../../auth/store/auth.store.js"
import { useNotificationsStore } from "../store/notifications.store.js"
import { subscribeNotifications } from "../socket/notifications.socket.js"
import { createLiveHandler } from "./notificationSocket/liveNotification.js"
import { createReadySync } from "./notificationSocket/readySync.js"

export { READY_ACK_TIMEOUT_MS, READY_MAX_ATTEMPTS } from "../constants/notificationReady.js"
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

  useEffect(() => {
    if (!socket || accountUuid === null) return undefined

    const store = useNotificationsStore
    store.getState().syncAccount()

    // 스토어 계정이 지금 로그인 계정과 다르면 받지 않음
    const accountId = store.getState().accountId
    const accountGeneration = store.getState().accountGeneration
    if (accountId !== accountUuid) return undefined

    let cancelled = false

    const accountAlive = () =>
      !cancelled && store.getState().accountGeneration === accountGeneration

    const ready = createReadySync(socket, store, accountAlive)
    const off = subscribeNotifications(socket, {
      created: createLiveHandler(store, accountId, accountAlive),
      connect: ready.connect,
      disconnect: ready.disconnect,
    })

    ready.start({ connected: socket.connected !== false })

    return () => {
      cancelled = true
      ready.teardown()
      off()
    }
  }, [socket, accountUuid])
}
