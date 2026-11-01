// 알림 복원(목록 받기)·실시간 알림·소리 한 번만 울리기 액션
// notifications.store.js가 create 안에서 펼쳐 씀
import { callNotificationsApi } from "./callApi.js"
import { isNotificationBackedSourceKey, isUsableNotification } from "../../utils/notificationRows.js"
import { mergeNotifications } from "../../utils/mergeNotifications.js"

// 복원·실시간 알림·소리 판정 액션 묶음
export const snapshotActions = (set, get) => ({
  // 목록 받아 합침, 복원 중 쌓아 둔 실시간 알림도 같이 넣음
  loadSnapshot: async () => {
    // 계정 먼저 맞추고, 로그인 안 했으면 거절
    get().syncAccount()
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    // 요청 세대 올림: 더 늦게 시작한 복원만 결과를 씀
    const requestGeneration = get().requestGeneration + 1
    set({ requestGeneration, status: "loading", error: null, restorePending: true })

    // 실패하면 오류 상태, 더 늦게 시작한 복원이나 계정 바뀜이 있으면 결과 버림
    let data
    try {
      data = await callNotificationsApi("fetchNotificationsApi")
    } catch (error) {
      if (!get().isCurrent(accountGeneration, requestGeneration)) return { ok: false, reason: "stale" }
      set({ status: "error", error: error?.message ?? "알림을 불러오지 못했습니다." })
      return { ok: false, reason: "error" }
    }

    // 성공해도 지난 요청이면 결과 버림
    if (!get().isCurrent(accountGeneration, requestGeneration)) return { ok: false, reason: "stale" }

    // 받은 줄·쌓아 둔 줄은 이미 본 소리로 침, 복원 뒤 다시 울리지 않게 함
    const rows = Array.isArray(data) ? data.filter(isUsableNotification) : []
    const state = get()
    const soundSeen = new Set(state.soundSeen)
    for (const row of rows) soundSeen.add(row.sourceKey)

    const buffered = state.liveBuffer.filter(isUsableNotification)
    for (const row of buffered) soundSeen.add(row.sourceKey)

    // 합치고 복원 끝 표시, 이 표시가 ready 보내기 신호
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
    // 계정 먼저 맞춤, 다른 계정·빈 키·이미 울린 키면 안 울림
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
    // 다른 계정·모양 틀린 알림은 버림
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
