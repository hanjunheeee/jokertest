// 친구 목록 패널 (탭 전환·닫기를 맡고, 목록·차단·초대 값은 훅에서 받아 넘김)
// LobbyFriendArea가 친구 버튼으로 열고 닫음
import { AnimatePresence } from "framer-motion"
import { useFriendListSync } from "../../hooks/useFriendListSync.js"
import { usePanelView } from "../../hooks/friendPanel/usePanelView.js"
import { useBlockActions } from "../../hooks/friendPanel/useBlockActions.js"
import { usePanelInvites } from "../../hooks/friendPanel/usePanelInvites.js"
import FriendListPanelBackdrop from "./panel/FriendListPanelBackdrop.jsx"
import FriendListPanelFrame from "./panel/FriendListPanelFrame.jsx"
import FriendListPanelContent from "./panel/FriendListPanelContent.jsx"

// 훅 부르는 순서(탭 → 목록 동기화 → 차단 → 초대)가 효과 실행 순서라 그대로 둠
export default function FriendListPanel({
  open,
  onClose,
  targetRequestId = null,
  targetInviteId = null,
  roomId = null,
  isRoomVerified = false,
}) {
  const [panelView, setPanelView] = usePanelView(open, targetRequestId, targetInviteId)

  const {
    onlineFriends,
    offlineFriends,
    favoriteFriends,
    incomingRequests,
    friendsError,
    incomingError,
    blockedUsers,
    blocksStatus,
    blocksError,
    processingRequestIds,
    acceptAllResult,
    handleRefreshFriends,
    handleRefreshBlocks,
    handleAcceptRequest,
    handleAcceptAll,
  } = useFriendListSync(open)

  const { blockingIds, handleBlockUser, handleUnblockUser } = useBlockActions()

  const { invite, inviteList } = usePanelInvites({ open, roomId, isRoomVerified })

  // 탭 바꾸기
  const showListView = () => setPanelView("list")
  const showRequestView = () => setPanelView("request")
  const showAcceptView = () => setPanelView("accept")
  const showInviteView = () => setPanelView("invite")
  // 차단 탭은 열 때마다 서버 목록을 다시 받음
  const showBlockView = () => {
    setPanelView("block")
    handleRefreshBlocks()
  }

  // 닫으면 다음에 열 때 목록 탭부터 보이게 함
  const handleClose = () => {
    showListView()
    onClose()
  }

  // 친구 줄 차단 버튼에 넘길 묶음
  const friendBlock = { onBlock: handleBlockUser, blockingIds }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <FriendListPanelBackdrop onClose={handleClose} />
          <FriendListPanelFrame view={panelView}>
            <FriendListPanelContent
              panelView={panelView}
              onListView={showListView}
              onRequestView={showRequestView}
              onAcceptView={showAcceptView}
              onInviteView={showInviteView}
              onBlockView={showBlockView}
              onlineFriends={onlineFriends}
              offlineFriends={offlineFriends}
              favoriteFriends={favoriteFriends}
              friendsError={friendsError}
              incomingRequests={incomingRequests}
              incomingError={incomingError}
              processingRequestIds={processingRequestIds}
              acceptAllResult={acceptAllResult}
              onRefreshRequests={handleRefreshFriends}
              onAcceptRequest={handleAcceptRequest}
              onAcceptAll={handleAcceptAll}
              onBlockUser={handleBlockUser}
              onUnblockUser={handleUnblockUser}
              blockingIds={blockingIds}
              friendBlock={friendBlock}
              blockedUsers={blockedUsers}
              blocksStatus={blocksStatus}
              blocksError={blocksError}
              onRefreshBlocks={handleRefreshBlocks}
              invite={invite}
              inviteList={inviteList}
              targetRequestId={targetRequestId}
              targetInviteId={targetInviteId}
            />
          </FriendListPanelFrame>
        </>
      ) : null}
    </AnimatePresence>
  )
}
