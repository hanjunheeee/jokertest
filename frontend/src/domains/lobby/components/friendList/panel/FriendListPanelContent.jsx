// 친구 목록 패널 안쪽 (탭 줄 + 지금 탭 내용 + 초대 소리 진단)
// FriendListPanel이 패널 틀 안에 그림
import FriendAcceptTab from "../accept/FriendAcceptTab.jsx"
import FriendBlockTab from "../block/FriendBlockTab.jsx"
import FriendListTabContent from "../list/FriendListTabContent.jsx"
import FriendListViewTabs from "../FriendListViewTabs.jsx"
import FriendRequestTab from "../request/FriendRequestTab.jsx"
import GameInviteTab from "../invite/GameInviteTab.jsx"
import InviteSfxDiagnosticsPanel from "../diagnostics/InviteSfxDiagnosticsPanel.jsx"

// 탭마다 필요한 값만 넘김, 상태·처리는 FriendListPanel이 가짐
export default function FriendListPanelContent({
  panelView,
  onListView,
  onRequestView,
  onAcceptView,
  onInviteView,
  onBlockView,
  onlineFriends,
  offlineFriends,
  favoriteFriends,
  friendsError,
  incomingRequests,
  incomingError,
  processingRequestIds,
  acceptAllResult,
  onRefreshRequests,
  onAcceptRequest,
  onAcceptAll,
  onBlockUser,
  onUnblockUser,
  blockingIds,
  friendBlock,
  blockedUsers,
  blocksStatus,
  blocksError,
  onRefreshBlocks,
  invite,
  inviteList,
  targetRequestId,
  targetInviteId,
}) {
  return (
    <>
      <FriendListViewTabs
        activeView={panelView}
        onRequestClick={onRequestView}
        onAcceptClick={onAcceptView}
        onInviteClick={onInviteView}
        onBlockClick={onBlockView}
        inviteCount={inviteList.pendingCount}
      />

      {panelView === "list" ? (
        <FriendListTabContent
          onlineFriends={onlineFriends}
          offlineFriends={offlineFriends}
          favoriteFriends={favoriteFriends}
          friendsError={friendsError}
          onRetry={onRefreshRequests}
          invite={invite}
          block={friendBlock}
        />
      ) : null}

      {panelView === "request" ? (
        <FriendRequestTab onBack={onListView} onBlock={onBlockUser} blockingIds={blockingIds} />
      ) : null}

      {panelView === "accept" ? (
        <FriendAcceptTab
          onBack={onListView}
          incomingRequests={incomingRequests}
          incomingError={incomingError}
          processingRequestIds={processingRequestIds}
          acceptAllResult={acceptAllResult}
          onAccept={onAcceptRequest}
          onBlock={onBlockUser}
          onAcceptAll={onAcceptAll}
          onRefresh={onRefreshRequests}
          targetRequestId={targetRequestId}
        />
      ) : null}

      {panelView === "invite" ? (
        <GameInviteTab
          onBack={onListView}
          invites={inviteList.invites}
          status={inviteList.status}
          error={inviteList.error}
          pendingInviteIds={inviteList.pendingInviteIds}
          inviteErrors={inviteList.inviteErrors}
          onAccept={inviteList.onAccept}
          onDecline={inviteList.onDecline}
          onRefresh={inviteList.onRefresh}
          targetInviteId={targetInviteId}
        />
      ) : null}

      {panelView === "block" ? (
        <FriendBlockTab
          onBack={onListView}
          blockedUsers={blockedUsers}
          status={blocksStatus}
          error={blocksError}
          processingIds={blockingIds}
          onUnblock={onUnblockUser}
          onRefresh={onRefreshBlocks}
        />
      ) : null}

      <InviteSfxDiagnosticsPanel />
    </>
  )
}
