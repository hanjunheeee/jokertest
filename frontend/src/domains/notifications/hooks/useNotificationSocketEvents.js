import { useEffect } from "react"

import { useAuthStore } from "../../auth/store/auth.store.js"
import { useNotificationsStore } from "../store/notifications.store.js"
import { dispatchSfxEvent } from "../../../shared/hooks/useSfxRuntime.js"

export const READY_ACK_TIMEOUT_MS = 5000
export const READY_MAX_ATTEMPTS = 3

let timerOverride = null

export function __setNotificationTimersForTests(next) {
  timerOverride = next ?? null
}

const schedule = (fn, ms) => (timerOverride?.setTimeout ?? globalThis.setTimeout)(fn, ms)
const unschedule = (id) => {
  if (id === null || id === undefined) return
  ;(timerOverride?.clearTimeout ?? globalThis.clearTimeout)(id)
}

export function useNotificationSocketEvents(socket) {
  const accountUuid = useAuthStore((state) =>
    state.isLoggedIn && state.user?.uuid ? state.user.uuid : null,
  )

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

    const accountId = store.getState().accountId
    const accountGeneration = store.getState().accountGeneration
    if (accountId !== accountUuid) return undefined

    let cancelled = false
    let connectionGeneration = 0
    let sync = null

    const accountAlive = () =>
      !cancelled && store.getState().accountGeneration === accountGeneration

    const handleNotificationCreated = (payload) => {
      if (!accountAlive()) return
      const notification = payload?.notification
      const applied = store.getState().receiveLiveNotification(accountId, notification)
      if (!applied.applied) return

      const envelope = payload?.sfxEvent
      if (envelope === null || typeof envelope !== "object") return
      if (envelope.accountId !== accountId) return
      if (envelope.origin !== "live") return
      if (!store.getState().consumeSoundEvent(accountId, notification.sourceKey)) return

      dispatchSfxEvent({
        kind: envelope.kind,
        eventId: envelope.eventId,
        accountId,
        origin: "live",
      })
    }

    socket.on("notification_created", handleNotificationCreated)

    const isActive = (active) =>
      active !== null && sync === active && accountAlive() && active.generation === connectionGeneration

    const teardownSync = () => {
      if (sync === null) return
      unschedule(sync.timer)
      sync.timer = null
      try {
        sync.unsubscribe()
      } catch {
      }
      sync = null
    }

    const attemptReady = () => {
      const active = sync
      if (!isActive(active)) return
      if (active.readyAcked || !active.snapshotReady) return
      if (!active.connected || socket.connected === false) {
        store.getState().setReadyState("retry")
        return
      }
      if (active.attempts >= READY_MAX_ATTEMPTS) {
        store.getState().setReadyState("retry")
        return
      }

      active.attempts += 1
      let settled = false
      const settle = (ok) => {
        if (settled) return
        settled = true
        unschedule(active.timer)
        active.timer = null
        if (!isActive(active)) return
        if (ok) {
          active.readyAcked = true
          store.getState().setReadyState("sent")
          return
        }
        store.getState().setReadyState("retry")
        if (active.attempts < READY_MAX_ATTEMPTS) attemptReady()
      }

      try {
        socket.emit("notifications_ready", {}, (ack) => settle(ack?.ok === true))
      } catch {
        settle(false)
        return
      }
      active.timer = schedule(() => settle(false), READY_ACK_TIMEOUT_MS)
    }

    const startSync = ({ connected }) => {
      teardownSync()
      connectionGeneration += 1
      const active = {
        generation: connectionGeneration,
        connected,
        attempts: 0,
        timer: null,
        readyAcked: false,
        snapshotReady: false,
        unsubscribe: () => {},
      }
      sync = active

      active.unsubscribe = store.subscribe((state, previous) => {
        if (!isActive(active)) return
        if (state.snapshotLoaded && !previous.snapshotLoaded) {
          active.snapshotReady = true
          attemptReady()
        }
      })

      store.getState().beginResync()
      store.getState().loadSnapshot().then(
        (result) => {
          if (!isActive(active)) return
          if (!result.ok) store.getState().setReadyState("retry")
        },
        () => {
          if (!isActive(active)) return
          store.getState().setReadyState("retry")
        },
      )
    }

    const handleConnect = () => {
      if (!accountAlive()) return
      if (sync !== null && sync.connected === false) {
        sync.connected = true
        attemptReady()
        return
      }
      startSync({ connected: true })
    }

    const handleDisconnect = () => {
      if (!accountAlive()) return
      connectionGeneration += 1
      teardownSync()
      store.getState().setReadyState("retry")
    }

    socket.on("connect", handleConnect)
    socket.on("disconnect", handleDisconnect)

    startSync({ connected: socket.connected !== false })

    return () => {
      cancelled = true
      teardownSync()
      socket.off("notification_created", handleNotificationCreated)
      socket.off("connect", handleConnect)
      socket.off("disconnect", handleDisconnect)
    }
  }, [socket, accountUuid])
}
