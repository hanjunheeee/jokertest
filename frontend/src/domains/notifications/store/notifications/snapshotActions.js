// 알림 복원(목록 받기)·실시간 알림·소리 한 번만 울리기 액션
// notifications.store.js가 create 안에서 펼쳐 씀
import { callNotificationsApi } from "./callApi.js"
import { isNotificationBackedSourceKey, isUsableNotification } from "../../utils/notificationRows.js"
import { mergeNotifications } from "../../utils/mergeNotifications.js"

export const snapshotActions = (set, get) => ({
  // 목록 받아 합침, 복원 중 쌓아 둔 실시간 알림도 같이 넣음
  loadSnapshot: async () => {
    get().syncAccount()
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    // 요청 세대 올림: 더 늦게 시작한 복원만 결과를 씀
    const requestGeneration = get().requestGeneration + 1
    set({ requestGeneration, status: "loading", error: null, restorePending: true })

    let data
    try {
      data = await callNotificationsApi("fetchNotificationsApi")
    } catch (error) {
      if (!get().isCurrent(accountGeneration, requestGeneration)) return { ok: false, reason: "stale" }
      set({ status: "error", error: error?.message ?? "알림을 불러오지 못했습니다." })
      return { ok: false, reason: "error" }
    }

    if (!get().isCurrent(accountGeneration, requestGeneration)) return { ok: false, reason: "stale" }

    // 받은 줄·쌓아 둔 줄은 이미 본 소리로 침, 복원 뒤 다시 울리지 않게 함
    const rows = Array.isArray(data) ? data.filter(isUsableNotification) : []
    const state = get()
    const soundSeen = new Set(state.soundSeen)
    for (const row of rows) soundSeen.add(row.sourceKey)

    const buffered = state.liveBuffer.filter(isUsableNotification)
    for (const row of buffered) soundSeen.add(row.sourceKey)

    set({
      items: mergeNotifications(state.items, [...rows, ...buffered]),
      soundSeen,
      liveBuffer: [],
      snapshotLoaded: true,
      restorePending: false,
      status: "success",
      error: null,
    })
    return { ok: true, count: rows.length }
  },

  // 같은 소리 키는 한 번만 true, 울릴지 말지를 여기서 정함
  consumeSoundEvent: (accountId, sourceKey) => {
    get().syncAccount()
    const state = get()
    if (accountId === null || accountId !== state.accountId) return false
    if (typeof sourceKey !== "string" || sourceKey.length === 0) return false
    if (state.soundSeen.has(sourceKey)) return false

    // 복원 중인 알림 기반 키는 복원 결과를 보고 정하게 미룸
    if (!state.snapshotLoaded && state.restorePending && isNotificationBackedSourceKey(sourceKey)) {
      return false
    }

    const soundSeen = new Set(state.soundSeen)
    soundSeen.add(sourceKey)
    set({ soundSeen })
    return true
  },

  // 실시간 알림 넣기, 복원 전이면 쌓아 뒀다가 복원 때 합침
  receiveLiveNotification: (accountId, notification) => {
    const state = get()
    if (accountId === null || accountId !== state.accountId) return { applied: false, reason: "account-mismatch" }
    if (!isUsableNotification(notification)) return { applied: false, reason: "invalid" }

    if (!state.snapshotLoaded) {
      set({ liveBuffer: [...state.liveBuffer, notification] })
      return { applied: false, reason: "buffered" }
    }

    set({ items: mergeNotifications(state.items, [notification]) })
    return { applied: true }
  },
})
