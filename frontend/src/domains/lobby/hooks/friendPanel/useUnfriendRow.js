// 친구 줄 하나의 친구 끊기 상태·처리 (묻는 중인지·끊는 중인지·실패 문구·끊기/확인/취소)
// 데스크톱 FriendListRow·모바일 FriendRow가 줄마다 부름
import { useState } from "react"
import { useFriendStore } from "../../store/friend.store.js"

// 끊는 중·실패 문구는 스토어에서 그 친구 것만 고르고, "끊을까요?" 묻는 중인지는 이 줄만 앎
export function useUnfriendRow(friendId) {
  const processing = useFriendStore((state) => state.unfriendPendingIds.has(friendId))
  const error = useFriendStore((state) => state.unfriendErrors[friendId] ?? null)
  const unfriend = useFriendStore((state) => state.unfriend)
  const [confirming, setConfirming] = useState(false)

  return {
    confirming,
    processing,
    error,
    // 한 번 누르면 묻기만 함 (실수로 끊지 않게), 확인을 눌러야 요청이 나감
    onAsk: () => setConfirming(true),
    onConfirm: () => {
      setConfirming(false)
      unfriend(friendId)
    },
    onCancel: () => setConfirming(false),
  }
}
