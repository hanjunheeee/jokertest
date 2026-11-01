// 친구 시트 내용 칸 (지금 탭 하나만 그림)
// FriendsSheet가 탭 줄 아래에 그림
import ListTab from "./list/ListTab.jsx"
import AddTab from "./add/AddTab.jsx"
import AcceptTab from "./accept/AcceptTab.jsx"
import InviteTab from "./invite/InviteTab.jsx"
import BlockTab from "./block/BlockTab.jsx"

// 값·처리 함수는 useFriendsSheet 묶음에서 탭마다 필요한 것만 골라 넘김
export default function SheetBody({ sheet }) {
  const { view, sync, block } = sheet

  if (view === "request") {
    return <AddTab onBlock={block.onBlock} blockingIds={block.blockingIds} />
  }

  if (view === "accept") {
    return (
      <AcceptTab
        incomingRequests={sync.incomingRequests}
        incomingError={sync.incomingError}
        loaded={sheet.incomingLoaded}
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
    return <InviteTab inviteList={sheet.inviteList} targetInviteId={sheet.targetInviteId} />
  }

  if (view === "block") {
    return (
      <BlockTab
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
      loaded={sheet.friendsLoaded}
      onRetry={sync.handleRefreshFriends}
      invite={sheet.invite}
      block={block}
      onGoAdd={() => sheet.selectView("request")}
    />
  )
}
