// 실시간 새 알림 받기·알림 소리 울리기
// 알림 소켓 훅이 소켓 연결마다 만들어 씀
import { dispatchSfxEvent } from "../../../../shared/hooks/useSfxRuntime.js"

// 새 알림 처리 함수 만듦: 목록에 들어간 알림만 소리 후보로 봄
export function createLiveHandler(store, accountId, accountAlive) {
  return (payload) => {
    if (!accountAlive()) return
    const notification = payload?.notification
    const applied = store.getState().receiveLiveNotification(accountId, notification)
    if (!applied.applied) return

    // 내 계정·실시간 소리이고 처음 보는 키일 때만 울림
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
}
