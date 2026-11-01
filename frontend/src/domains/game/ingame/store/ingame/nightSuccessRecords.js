// 밤 성공 연출 기록 장부: eventId별 수신 범위·끝맺음·확인 응답 상태
// 액션 묶음·받기 판단·연결·신원 감시가 사용, 연출 훅은 입구로 수신 범위만 읽음
import { EMPTY_NIGHT_SUCCESS_QUEUE } from "../../constants/store/ingameStore.js"
import { getStore } from "./storeRef.js"

// eventId → { scope, entry, completed, ackStatus }
export const records = new Map()

// 장부 지우고 대기열·연출 대기도 비움 (연결·신원이 바뀌면 옛 연출을 버림)
export function cancelRecords() {
  if (records.size > 0) records.clear()
  const store = getStore()
  if (!store) return
  store.setState((current) => {
    const patch = {}
    if (current.nightSuccessQueue.length !== 0) patch.nightSuccessQueue = EMPTY_NIGHT_SUCCESS_QUEUE
    if (current.nightPresentationWait !== null) patch.nightPresentationWait = null
    return Object.keys(patch).length === 0 ? current : patch
  })
}

// 장부 지우고 빈 대기열 조각 돌려줌 (상태 갱신은 부르는 쪽이 함)
export function clearQueue() {
  records.clear()
  return { nightSuccessQueue: EMPTY_NIGHT_SUCCESS_QUEUE }
}

// 대기열 항목을 받을 때의 수신 범위 복사본 (끝났거나 다른 항목이면 null)
export function readNightSuccessReceiptScope(entry) {
  if (entry === null || typeof entry !== "object") return null
  const eventId = entry.eventId
  if (typeof eventId !== "string" || eventId.length === 0) return null
  const record = records.get(eventId)
  if (!record || record.completed === true) return null
  if (record.entry !== entry) return null
  const scope = record.scope
  if (scope === null || typeof scope !== "object") return null
  return Object.freeze({ ...scope })
}
