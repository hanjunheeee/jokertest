import { useCallback, useEffect } from "react"
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriendRequestResults,
} from "../api/friend.api.js"
import { emptyAcceptAllResult, useFriendStore } from "../store/friend.store.js"
import { applyFriendFavoriteFlags } from "../utils/applyFriendFavoriteFlags.js"
import { groupFriends } from "../utils/groupFriends.js"

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
      accepted.push(requestId)
      return
    }
    if (confirmed === undefined) {
      unconfirmed.push(requestId)
      return
    }
    failed.push(requestId)
  })

  return { accepted, failed, unconfirmed }
}

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

  const processingRequestIds = useFriendStore((state) => state.processingRequestIds)
  const acceptAllResult = useFriendStore((state) => state.acceptAllResult)
  const lockRequests = useFriendStore((state) => state.lockRequests)
  const unlockRequests = useFriendStore((state) => state.unlockRequests)
  const setAcceptAllResult = useFriendStore((state) => state.setAcceptAllResult)

  useEffect(() => {
    if (!friendListOpen) return

    fetchFriendsFromStore()
    fetchIncomingFromStore()
    fetchFavoritesFromStore()
  }, [friendListOpen])

  const handleRefreshFriends = async () => {
    await Promise.all([fetchFriendsFromStore(), fetchIncomingFromStore(), fetchFavoritesFromStore()])
  }

  const stillSameAccount = (generation) => useFriendStore.getState().isCurrent(generation)

  const runRequestOperation = async (requestId, { call, onSuccess, failureMessage }) => {
    const store = useFriendStore.getState()
    const generation = store.syncAccount()
    const operationId = store.beginOperation()
    if (lockRequests([requestId], operationId).length === 0) return
    try {
      await call(requestId)
      if (!stillSameAccount(generation)) return
      await onSuccess(requestId)
    } catch (error) {
      if (!stillSameAccount(generation)) return
      console.error(failureMessage, error.message)
      await fetchIncomingFromStore()
    } finally {
      unlockRequests([requestId], operationId)
    }
  }

  const handleAcceptRequest = (requestId) => runRequestOperation(requestId, {
    call: acceptFriendRequest,
    onSuccess: async (id) => {
      removeIncomingRequest(id)
      await fetchFriendsFromStore()
    },
    failureMessage: "친구 수락 실패:",
  })

  const handleDeclineRequest = (requestId) => runRequestOperation(requestId, {
    call: declineFriendRequest,
    onSuccess: async (id) => { removeIncomingRequest(id) },
    failureMessage: "친구 거절 실패:",
  })

  const handleAcceptAll = async () => {
    const store = useFriendStore.getState()
    const generation = store.syncAccount()
    const operationId = store.beginOperation()
    const requestIds = incomingRequests
      .map((request) => request.request_id)
      .filter((id) => id !== undefined && id !== null)

    const locked = lockRequests(requestIds, operationId)
    if (locked.length === 0) return

    setAcceptAllResult({ ...emptyAcceptAllResult(), running: true })

    try {
      const settled = await Promise.allSettled(locked.map((id) => acceptFriendRequest(id)))

      if (!stillSameAccount(generation)) return

      const undeterminedIds = locked.filter((_, index) => settled[index].status === "rejected")
      const confirmedStatuses = new Map()
      if (undeterminedIds.length > 0) {
        try {
          const rows = await fetchFriendRequestResults(undeterminedIds)
          if (!stillSameAccount(generation)) return
          for (const row of Array.isArray(rows) ? rows : []) {
            if (typeof row?.status === "string") confirmedStatuses.set(row.request_id, row.status)
          }
        } catch (error) {
          if (!stillSameAccount(generation)) return
          console.error("친구 요청 결과 확인 실패:", error.message)
        }
      }

      const { accepted, failed, unconfirmed } = classifyAcceptResults(locked, settled, confirmedStatuses)

      if (!stillSameAccount(generation)) return

      const [friendsResult, incomingResult] = await Promise.all([
        fetchFriendsFromStore(),
        fetchIncomingFromStore(),
      ])
      const refreshError = [
        friendsResult.ok ? null : "친구 목록",
        incomingResult.ok ? null : "받은 요청 목록",
      ].filter(Boolean)

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
    } finally {
      unlockRequests(locked, operationId)
    }
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
