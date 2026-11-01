// 친구 목록 패널의 차단·차단 해제 (처리 중인 대상 표시 포함)
// FriendListPanel이 목록 동기화 훅 다음에 부름
import { useCallback, useState } from "react"
import { useFriendStore } from "../../store/friend.store.js"

// 요청이 끝날 때까지 대상 id를 처리 중으로 두어 버튼 중복 클릭을 막음
export function useBlockActions() {
  const blockUser = useFriendStore((state) => state.blockUser)
  const unblockUser = useFriendStore((state) => state.unblockUser)
  const [blockingIds, setBlockingIds] = useState(() => new Set())

  // 대상 id를 처리 중으로 두고 요청, 끝나면 성공·실패 상관없이 뺌
  const run = useCallback(async (targetId, action) => {
    setBlockingIds((previous) => new Set(previous).add(targetId))
    try {
      await action(targetId)
    } finally {
      setBlockingIds((previous) => {
        const next = new Set(previous)
        next.delete(targetId)
        return next
      })
    }
  }, [])

  // 차단·차단 해제 버튼 처리
  const handleBlockUser = useCallback(
    (targetId) => run(targetId, blockUser),
    [run, blockUser],
  )
  const handleUnblockUser = useCallback(
    (targetId) => run(targetId, unblockUser),
    [run, unblockUser],
  )

  return { blockingIds, handleBlockUser, handleUnblockUser }
}
