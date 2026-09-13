import { useCallback, useEffect } from "react"
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriendRequestResults,
} from "@/domains/lobby/api/friend.api.js"
import { emptyAcceptAllResult, useFriendStore } from "@/domains/lobby/store/friend.store"
import { applyFriendFavoriteFlags } from "@/domains/lobby/utils/applyFriendFavoriteFlags.js"
import { groupFriends } from "@/domains/lobby/utils/groupFriends.js"

/**
 * F-19(AC-02): 전체 수락 결과를 세 갈래로 나눈다.
 *
 *   accepted    — 서버가 수락을 확정했다.
 *   failed      — 서버가 명시적으로 거부했다(이미 처리됨·권한 없음 등).
 *   unconfirmed — 응답을 받지 못했다. **실패로도 성공으로도 단정하지 않고**, 인증된 결과
 *                 조회로 다시 확인한다. 그래도 알 수 없으면 그대로 "확정 못 함"으로 남긴다.
 */
export function classifyAcceptResults(requestIds, settled, confirmedStatuses) {
  const accepted = []
  const failed = []
  const unconfirmed = []

  requestIds.forEach((requestId, index) => {
    const outcome = settled[index]
    if (outcome.status === "fulfilled") {
      accepted.push(requestId)
      return
    }
    const confirmed = confirmedStatuses.get(requestId)
    if (confirmed === "ACCEPTED") {
      // 응답만 유실됐고 서버는 실제로 수락했다.
      accepted.push(requestId)
      return
    }
    if (confirmed === undefined) {
      // 결과 조회 자체가 실패했거나 그 행을 볼 수 없었다 — 모른다.
      unconfirmed.push(requestId)
      return
    }
    failed.push(requestId)
  })

  return { accepted, failed, unconfirmed }
}

// 친구 목록 패널이 열릴 때 친구 목록과 받은 친구 요청을 동기화하는 훅입니다.
export function useFriendListSync(friendListOpen) {
  const friends = useFriendStore((state) => state.friends)
  const favoriteFriendIds = useFriendStore((state) => state.favoriteFriendIds)
  const favoritePendingIds = useFriendStore((state) => state.favoritePendingIds)
  const incomingRequests = useFriendStore((state) => state.incomingRequests)
  const friendsError = useFriendStore((state) => state.friendsError)
  const incomingError = useFriendStore((state) => state.incomingError)
  const blockedUsers = useFriendStore((state) => state.blockedUsers)
  const blocksStatus = useFriendStore((state) => state.blocksStatus)
  const blocksError = useFriendStore((state) => state.blocksError)

  const fetchFriendsFromStore = useFriendStore((state) => state.fetchFriends)
  const fetchIncomingFromStore = useFriendStore((state) => state.fetchIncomingRequests)
  const fetchFavoritesFromStore = useFriendStore((state) => state.fetchFavorites)
  const fetchBlocksFromStore = useFriendStore((state) => state.fetchBlocks)
  const removeIncomingRequest = useFriendStore((state) => state.removeIncomingRequest)

  // 요청 단위 잠금과 전체 수락 집계는 **공용 store**가 소유한다(AC-02).
  //
  // 훅 지역 상태였을 때는 같은 계정이어도 패널이 언마운트·리마운트되면(로비 → 대기방
  // 이동, 탭 교체) 잠금이 통째로 사라져 이미 처리 중인 요청을 새 화면이 다시 처리할 수
  // 있었다. store로 옮기면 두 화면이 같은 집합을 보고, 계정이 바뀌면 syncAccount가 잠금과
  // 집계를 함께 버린다 — 이전 계정의 처리 결과가 새 계정 화면에 남지 않는다.
  const processingRequestIds = useFriendStore((state) => state.processingRequestIds)
  const acceptAllResult = useFriendStore((state) => state.acceptAllResult)
  const lockRequests = useFriendStore((state) => state.lockRequests)
  const unlockRequests = useFriendStore((state) => state.unlockRequests)
  const setAcceptAllResult = useFriendStore((state) => state.setAcceptAllResult)

  useEffect(() => {
    // 친구 목록 패널이 닫혀 있으면 서버 요청을 보내지 않습니다.
    if (!friendListOpen) return

    // 패널이 열리는 순간 최신 친구 목록·받은 요청·서버 즐겨찾기를 가져옵니다.
    // 즐겨찾기가 서버 값이 된 뒤로는(AC-03) 이 조회가 별 표시 복원의 유일한 근거입니다.
    fetchFriendsFromStore()
    fetchIncomingFromStore()
    fetchFavoritesFromStore()
  }, [friendListOpen]) // 패널 열림 여부가 바뀔 때만 동기화합니다.

  const handleRefreshFriends = async () => {
    // 새로고침 버튼에서 친구 목록·받은 요청·즐겨찾기를 동시에 다시 가져옵니다.
    await Promise.all([fetchFriendsFromStore(), fetchIncomingFromStore(), fetchFavoritesFromStore()])
  }

  /** 이 비동기 결과가 여전히 같은 계정의 것인가. 아니면 아무 상태도 건드리지 않는다. */
  const stillSameAccount = (generation) => useFriendStore.getState().isCurrent(generation)

  const handleAcceptRequest = async (requestId) => {
    const generation = useFriendStore.getState().syncAccount()
    if (lockRequests([requestId]).length === 0) return
    try {
      await acceptFriendRequest(requestId)
      if (!stillSameAccount(generation)) return

      // 수락한 요청은 받은 요청 목록에서 바로 제거합니다.
      removeIncomingRequest(requestId)

      // 친구가 새로 추가되었으므로 친구 목록도 다시 가져옵니다.
      await fetchFriendsFromStore()
    } catch (error) {
      if (!stillSameAccount(generation)) return
      console.error("친구 수락 실패:", error.message)
      // 실패했으면 목록에서 지우지 않습니다 — 서버에는 아직 대기 중입니다.
      await fetchIncomingFromStore()
    } finally {
      // 계정이 바뀌었다면 잠금 집합이 이미 통째로 비워져 있어 무해한 no-op입니다.
      unlockRequests([requestId])
    }
  }

  const handleDeclineRequest = async (requestId) => {
    const generation = useFriendStore.getState().syncAccount()
    if (lockRequests([requestId]).length === 0) return
    try {
      await declineFriendRequest(requestId)
      if (!stillSameAccount(generation)) return

      // 거절한 요청은 받은 요청 목록에서 바로 제거합니다.
      removeIncomingRequest(requestId)
    } catch (error) {
      if (!stillSameAccount(generation)) return
      console.error("친구 거절 실패:", error.message)
      await fetchIncomingFromStore()
    } finally {
      unlockRequests([requestId])
    }
  }

  /**
   * F-19(AC-02): 전체 수락은 **요청별 독립 처리**다.
   *
   * 예전 구현은 Promise.all이라 하나만 실패해도 나머지의 성공을 안내하지 못했고, 성공했을
   * 때는 서버에 되묻지 않고 받은 요청 목록을 통째로 비웠다. 이제:
   *
   *   - 각 acceptFriendRequest를 독립 실행하고 **모두 정착한 뒤에** 진행한다.
   *   - 응답을 못 받은 요청은 인증된 결과 조회로 다시 확인한다(성공·실패로 단정하지 않는다).
   *   - 목록은 임의로 비우지 않고 **서버에서 다시 읽는다**. 재조회가 실패하면 처리 결과는
   *     그대로 두고 별도의 조회 오류를 남긴다.
   */
  const handleAcceptAll = async () => {
    const generation = useFriendStore.getState().syncAccount()
    const requestIds = incomingRequests
      .map((request) => request.request_id)
      .filter((id) => id !== undefined && id !== null)

    const locked = lockRequests(requestIds)
    if (locked.length === 0) return

    setAcceptAllResult({ ...emptyAcceptAllResult(), running: true })

    // 요청별 독립 실행 — 한 요청의 실패가 다른 요청의 성공을 롤백하지 않는다.
    const settled = await Promise.allSettled(locked.map((id) => acceptFriendRequest(id)))

    // 계정이 바뀐 뒤 정착한 결과는 **새 계정의 화면에 아무것도 쓰지 않는다**. 잠금은
    // syncAccount가 이미 비웠고, 집계도 이전 계정의 것이라 여기서 끝낸다.
    if (!stillSameAccount(generation)) return

    // 응답을 못 받은 요청만 서버에 되묻는다.
    const undeterminedIds = locked.filter((_, index) => settled[index].status === "rejected")
    const confirmedStatuses = new Map()
    if (undeterminedIds.length > 0) {
      try {
        const rows = await fetchFriendRequestResults(undeterminedIds)
        for (const row of Array.isArray(rows) ? rows : []) {
          if (typeof row?.status === "string") confirmedStatuses.set(row.request_id, row.status)
        }
      } catch (error) {
        // 결과 조회까지 실패하면 그 요청들은 "모름"으로 남는다 — 실패로 단정하지 않는다.
        console.error("친구 요청 결과 확인 실패:", error.message)
      }
    }

    const { accepted, failed, unconfirmed } = classifyAcceptResults(locked, settled, confirmedStatuses)

    // 목록을 임의로 비우지 않고 서버에서 각각 다시 읽는다.
    const [friendsResult, incomingResult] = await Promise.all([
      fetchFriendsFromStore(),
      fetchIncomingFromStore(),
    ])
    const refreshError = [
      friendsResult.ok ? null : "친구 목록",
      incomingResult.ok ? null : "받은 요청 목록",
    ].filter(Boolean)

    unlockRequests(locked)
    if (!stillSameAccount(generation)) return
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
  }

  const handleRefreshBlocks = useCallback(() => fetchBlocksFromStore(), [fetchBlocksFromStore])

  return {
    ...groupFriends(applyFriendFavoriteFlags(friends, favoriteFriendIds)),
    incomingRequests,
    friendsError,
    incomingError,
    blockedUsers,
    blocksStatus,
    blocksError,
    favoritePendingIds,
    processingRequestIds,
    acceptAllResult,
    handleRefreshFriends,
    handleRefreshBlocks,
    handleAcceptRequest,
    handleDeclineRequest,
    handleAcceptAll,
  }
}
