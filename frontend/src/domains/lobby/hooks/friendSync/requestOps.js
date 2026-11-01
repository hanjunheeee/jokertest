// 받은 친구 신청 하나 수락·거절 (잠금 → 요청 → 성공 처리 → 잠금 풀기)
// useFriendListSync가 처리 함수를 받아 씀, 계정 확인 함수는 전부 수락(acceptAll.js)도 씀
import { acceptFriendRequest, declineFriendRequest } from "../../api/friend.api.js"
import { useFriendStore } from "../../store/friend.store.js"

// 요청 중에 계정이 바뀌었으면 결과를 반영하지 않음
export const isSameAccount = (generation) => useFriendStore.getState().isCurrent(generation)

// 같은 신청을 두 번 처리하지 않게 작업 번호로 잠그고, 실패하면 목록을 다시 받음
export function makeRequestHandlers({ lockRequests, unlockRequests, removeIncomingRequest, fetchFriends, fetchIncoming }) {
  // 한 건 처리 틀: 계정 맞추기 → 작업 번호로 잠금 → 요청 → 성공 처리, 끝나면 그 잠금만 풂
  const run = async (requestId, { call, onSuccess, failureMessage }) => {
    const store = useFriendStore.getState()
    const generation = store.syncAccount()
    const operationId = store.beginOperation()
    // 이미 처리 중인 신청이면 그냥 끝
    if (lockRequests([requestId], operationId).length === 0) return
    try {
      await call(requestId)
      if (!isSameAccount(generation)) return
      await onSuccess(requestId)
    } catch (error) {
      // 실패면 목록이 실제와 다를 수 있어 받은 신청 다시 받음
      if (!isSameAccount(generation)) return
      console.error(failureMessage, error.message)
      await fetchIncoming()
    } finally {
      unlockRequests([requestId], operationId)
    }
  }

  // 수락하면 친구 목록이 바뀌어 다시 받음
  const handleAcceptRequest = (requestId) => run(requestId, {
    call: acceptFriendRequest,
    onSuccess: async (id) => {
      removeIncomingRequest(id)
      await fetchFriends()
    },
    failureMessage: "친구 수락 실패:",
  })

  // 거절은 받은 신청 줄만 지움
  const handleDeclineRequest = (requestId) => run(requestId, {
    call: declineFriendRequest,
    onSuccess: async (id) => { removeIncomingRequest(id) },
    failureMessage: "친구 거절 실패:",
  })

  return { handleAcceptRequest, handleDeclineRequest }
}
