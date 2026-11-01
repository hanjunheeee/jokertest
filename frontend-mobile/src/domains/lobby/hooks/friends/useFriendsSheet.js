// 친구 시트 값·처리 묶기 (지금 탭·목록 동기화·차단·게임 초대, 주소의 알림 대상 id)
// FriendsSheet가 씀, 로직은 전부 데스크톱 훅을 그대로 부름
import { useSearchParams } from "react-router-dom"
import { usePanelView } from "@/domains/lobby/hooks/friendPanel/usePanelView.js"
import { useBlockActions } from "@/domains/lobby/hooks/friendPanel/useBlockActions.js"
import { usePanelInvites } from "@/domains/lobby/hooks/friendPanel/usePanelInvites.js"
import { useFriendListSync } from "@/domains/lobby/hooks/useFriendListSync.js"
import { parseFriendRequestTargetId, parseInviteTargetId } from "@/domains/lobby/hooks/useLobbyNotificationPanels.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"

// 훅 부르는 순서(탭 → 목록 동기화 → 차단 → 초대)는 데스크톱 FriendListPanel과 같게 둠 (효과 실행 순서)
export function useFriendsSheet({ open, onClose, roomId = null, isRoomVerified = false }) {
  // 알림에서 눌러 온 신청·초대 대상은 주소에서 읽음 (시트 props를 { open, onClose }로 유지하기)
  const [searchParams] = useSearchParams()
  const targetRequestId = parseFriendRequestTargetId(searchParams)
  const targetInviteId = parseInviteTargetId(searchParams)

  const [view, setView] = usePanelView(open, targetRequestId, targetInviteId)
  const sync = useFriendListSync(open)
  const { blockingIds, handleBlockUser, handleUnblockUser } = useBlockActions()
  const { invite, inviteList } = usePanelInvites({ open, roomId, isRoomVerified })

  // 첫 응답(성공·실패)이 반영됐는지로 불러오는 중을 가름 (스토어에 따로 상태 칸이 없음)
  const friendsLoaded = useFriendStore((state) => state.appliedResult.friends !== null)
  const incomingLoaded = useFriendStore((state) => state.appliedResult.incoming !== null)

  // 탭 바꾸기, 차단 탭은 열 때마다 서버 목록을 다시 받음
  const selectView = (next) => {
    setView(next)
    if (next === "block") sync.handleRefreshBlocks()
  }

  // 닫으면 다음에 열 때 목록 탭부터 보이게 함
  const close = () => {
    setView("list")
    onClose?.()
  }

  return {
    view,
    selectView,
    close,
    targetRequestId,
    targetInviteId,
    sync,
    friendsLoaded,
    incomingLoaded,
    block: { onBlock: handleBlockUser, onUnblock: handleUnblockUser, blockingIds },
    invite,
    inviteList,
  }
}
