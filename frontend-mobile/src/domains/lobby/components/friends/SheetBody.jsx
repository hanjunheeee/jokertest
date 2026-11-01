// 친구 시트 내용 칸 (지금 탭 하나만 그림, 목록 밖 탭은 뒤로 버튼으로 목록에 돌아감)
// FriendsSheet가 탭 줄 아래에 그림
import ListTab from "./list/ListTab.jsx"
import AddTab from "./add/AddTab.jsx"
import AcceptTab from "./accept/AcceptTab.jsx"
import InviteTab from "./invite/InviteTab.jsx"
import BlockTab from "./block/BlockTab.jsx"

// 값·처리 함수는 useFriendsSheet 묶음에서 탭마다 필요한 것만 골라 넘김 (데스크톱 FriendListPanelContent와 같은 갈래)
export default function SheetBody({ sheet }) {
  const { view, sync, block } = sheet
  const onBack = () => sheet.selectView("list")

  if (view === "request") {
    return <AddTab onBack={onBack} onBlock={block.onBlock} blockingIds={block.blockingIds} />
  }

  if (view === "accept") {
    return (
      <AcceptTab
        onBack={onBack}
        incomingRequests={sync.incomingRequests}
        incomingError={sync.incomingError}
        processingRequestIds={sync.processingRequestIds}
        acceptAllResult={sync.acceptAllResult}
        onAccept={sync.handleAcceptRequest}
        onBlock={block.onBlock}
        onAcceptAll={sync.handleAcceptAll}
        onRefresh={sync.handleRefreshFriends}
        targetRequestId={sheet.targetRequestId}
      />
    )
  }

  if (view === "invite") {
    return <InviteTab onBack={onBack} inviteList={sheet.inviteList} targetInviteId={sheet.targetInviteId} />
  }

  if (view === "block") {
    return (
      <BlockTab
        onBack={onBack}
        blockedUsers={sync.blockedUsers}
        status={sync.blocksStatus}
        error={sync.blocksError}
        processingIds={block.blockingIds}
        onUnblock={block.onUnblock}
        onRefresh={sync.handleRefreshBlocks}
      />
    )
  }

  return (
    <ListTab
      groups={sync}
      friendsError={sync.friendsError}
      onRetry={sync.handleRefreshFriends}
      invite={sheet.invite}
      block={block}
    />
  )
}
