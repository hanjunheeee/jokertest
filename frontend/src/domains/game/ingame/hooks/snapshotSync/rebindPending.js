// 다시 묶기 기다림 표시: 연결·신원이 바뀌어 스냅샷을 다시 받는 중인지 (모듈 하나에 하나만 둠)
// 스냅샷 동기화 훅·attempt.js가 켜고 끄고, 인게임 화면이 구독해서 결과 화면 이동을 미룸
import { useSyncExternalStore } from "react"

let identityRebindPending = false
const identityRebindListeners = new Set()

// 값이 바뀔 때만 구독자에게 알림
export function setIdentityRebindPending(next) {
  if (identityRebindPending === next) return
  identityRebindPending = next
  for (const listener of [...identityRebindListeners]) listener()
}

// 읽기·구독·훅 (화면은 훅으로 읽음)
export function getInGameSnapshotRebindPending() {
  return identityRebindPending
}

export function subscribeInGameSnapshotRebindPending(listener) {
  identityRebindListeners.add(listener)
  return () => identityRebindListeners.delete(listener)
}

export function useInGameSnapshotRebindPending() {
  return useSyncExternalStore(
    subscribeInGameSnapshotRebindPending,
    getInGameSnapshotRebindPending,
    getInGameSnapshotRebindPending,
  )
}
