// 받은 친구 신청 전부 수락 (잠금 → 모두 요청 → 실패분 결과 확인 → 목록 다시 받기 → 결과 기록)
// useFriendListSync의 전부 수락 버튼 처리가 씀
import { acceptFriendRequest, fetchFriendRequestResults } from "../../api/friend.api.js"
import { emptyAcceptAllResult } from "../../store/friend/state.js"
import { useFriendStore } from "../../store/friend.store.js"
import { classifyAcceptResults } from "../../utils/friend/acceptAll.js"
import { isSameAccount } from "./requestOps.js"

// 단계마다 계정이 바뀌었는지 보고, 바뀌었으면 결과를 남기지 않고 잠금만 풂
export async function runAcceptAll({ incomingRequests, lockRequests, unlockRequests, setAcceptAllResult, fetchFriends, fetchIncoming }) {
  const store = useFriendStore.getState()
  const generation = store.syncAccount()
  const operationId = store.beginOperation()
  const requestIds = incomingRequests
    .map((request) => request.request_id)
    .filter((id) => id !== undefined && id !== null)

  // 이미 다른 작업이 잡은 신청은 빼고 잠금
  const locked = lockRequests(requestIds, operationId)
  if (locked.length === 0) return

  setAcceptAllResult({ ...emptyAcceptAllResult(), running: true })

  try {
    const settled = await Promise.allSettled(locked.map((id) => acceptFriendRequest(id)))

    if (!isSameAccount(generation)) return

    // 실패한 요청은 실제로 처리됐을 수 있어 서버에 결과를 물음
    const undeterminedIds = locked.filter((_, index) => settled[index].status === "rejected")
    const confirmedStatuses = new Map()
    if (undeterminedIds.length > 0) {
      try {
        const rows = await fetchFriendRequestResults(undeterminedIds)
        if (!isSameAccount(generation)) return
        for (const row of Array.isArray(rows) ? rows : []) {
          if (typeof row?.status === "string") confirmedStatuses.set(row.request_id, row.status)
        }
      } catch (error) {
        if (!isSameAccount(generation)) return
        console.error("친구 요청 결과 확인 실패:", error.message)
      }
    }

    const { accepted, failed, unconfirmed } = classifyAcceptResults(locked, settled, confirmedStatuses)

    if (!isSameAccount(generation)) return

    // 목록 새로고침 실패는 결과와 따로 알림
    const [friendsResult, incomingResult] = await Promise.all([
      fetchFriends(),
      fetchIncoming(),
    ])
    const refreshError = [
      friendsResult.ok ? null : "친구 목록",
      incomingResult.ok ? null : "받은 요청 목록",
    ].filter(Boolean)

    if (!isSameAccount(generation)) return
    setAcceptAllResult({
      running: false,
      accepted: accepted.length,
      failed: failed.length,
      unconfirmed: unconfirmed.length,
      refreshError: refreshError.length > 0
        ? `${refreshError.join("·")}을 새로 불러오지 못했습니다.`
        : null,
      completedAt: Date.now(),
    })
  } finally {
    unlockRequests(locked, operationId)
  }
}
