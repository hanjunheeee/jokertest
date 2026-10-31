import { AnimatePresence, motion } from "framer-motion"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  FRIEND_PANEL_BACKDROP_CLASS,
  FRIEND_PANEL_CLASS,
  FRIEND_PANEL_CONTENT_CLASS,
  FRIEND_PANEL_FRAME_CLASS,
  FRIEND_PANEL_INSET_STYLE,
  FRIEND_PANEL_TRANSITION,
} from "@/domains/lobby/constants/friendListStyle.js"
import { useCallback, useEffect, useState } from "react"
import { getFriendPanelAriaLabel } from "@/domains/lobby/utils/friendListPanelAria.js"
import { useFriendListSync } from "@/domains/lobby/hooks/useFriendListSync.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"
import {
  loadInviteSnapshotAndPlayNew,
  requestGameInviteAccept,
} from "@/domains/lobby/hooks/useFriendSocketEvents.js"
import FriendAcceptTab from "@/domains/lobby/components/friendList/accept/FriendAcceptTab.jsx"
import FriendBlockTab from "@/domains/lobby/components/friendList/block/FriendBlockTab.jsx"
import FriendListTabContent from "@/domains/lobby/components/friendList/list/FriendListTabContent.jsx"
import FriendListViewTabs from "@/domains/lobby/components/friendList/FriendListViewTabs.jsx"
import FriendRequestTab from "@/domains/lobby/components/friendList/request/FriendRequestTab.jsx"
import GameInviteTab from "@/domains/lobby/components/friendList/invite/GameInviteTab.jsx"
import InviteSfxDiagnosticsPanel from "@/domains/lobby/components/friendList/diagnostics/InviteSfxDiagnosticsPanel.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

function FriendListPanelBackdrop({ onClose }) {
  return (
    <motion.button
      type="button"
      aria-label="친구 목록 닫기"
      className={FRIEND_PANEL_BACKDROP_CLASS}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FRIEND_PANEL_TRANSITION}
      onClick={onClose}
    />
  )
}

function FriendListPanelFrame({ view, children }) {
  return (
    <motion.aside
      role="dialog"
      aria-modal="true"
      aria-label={getFriendPanelAriaLabel(view)}
      className={FRIEND_PANEL_CLASS}
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 28 }}
      transition={FRIEND_PANEL_TRANSITION}
      onClick={(event) => event.stopPropagation()}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.panelFrame}
        alt=""
        className={FRIEND_PANEL_FRAME_CLASS}
      />
      <div className={FRIEND_PANEL_CONTENT_CLASS} style={FRIEND_PANEL_INSET_STYLE}>
        {children}
      </div>
    </motion.aside>
  )
}

function FriendListPanelContent({
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

export default function FriendListPanel({
  open,
  onClose,
  targetRequestId = null,
  targetInviteId = null,
  roomId = null,
  isRoomVerified = false,
}) {
  const [panelView, setPanelView] = useState("list")

  useEffect(() => {
    if (!open || targetRequestId == null) return
    setPanelView("accept")
  }, [open, targetRequestId])

  useEffect(() => {
    if (!open || targetInviteId === null) return
    setPanelView("invite")
  }, [open, targetInviteId])

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

  const blockUser = useFriendStore((state) => state.blockUser)
  const unblockUser = useFriendStore((state) => state.unblockUser)
  const [blockingIds, setBlockingIds] = useState(() => new Set())

  const runBlockAction = useCallback(async (targetId, action) => {
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

  const handleBlockUser = useCallback(
    (targetId) => runBlockAction(targetId, blockUser),
    [runBlockAction, blockUser],
  )
  const handleUnblockUser = useCallback(
    (targetId) => runBlockAction(targetId, unblockUser),
    [runBlockAction, unblockUser],
  )

  const invites = useGameInviteStore((state) => state.invites)
  const inviteStatus = useGameInviteStore((state) => state.status)
  const inviteError = useGameInviteStore((state) => state.error)
  const pendingInviteIds = useGameInviteStore((state) => state.pendingInviteIds)
  const inviteErrors = useGameInviteStore((state) => state.inviteErrors)
  const declineInvite = useGameInviteStore((state) => state.declineInvite)
  const sendInvite = useGameInviteStore((state) => state.sendInvite)

  useEffect(() => {
    if (!open) return
    loadInviteSnapshotAndPlayNew()
  }, [open])

  const showListView = () => setPanelView("list")
  const showRequestView = () => setPanelView("request")
  const showAcceptView = () => setPanelView("accept")
  const showInviteView = () => setPanelView("invite")
  const showBlockView = () => {
    setPanelView("block")
    handleRefreshBlocks()
  }

  const handleClose = () => {
    showListView()
    onClose()
  }

  const handleSendInvite = useCallback((receiverId) => {
    if (roomId === null || !isRoomVerified) return
    return sendInvite(receiverId, `${roomId}:${receiverId}`)
  }, [roomId, isRoomVerified, sendInvite])

  const friendBlock = { onBlock: handleBlockUser, blockingIds }

  const canInvite = roomId !== null
  const invite = canInvite
    ? {
        onInvite: handleSendInvite,
        disabled: !isRoomVerified,
        disabledReason: "대기방 상태를 확인하는 중입니다.",
      }
    : null

  const pendingCount = invites.filter((item) => item.status === "PENDING").length

  const inviteList = {
    invites,
    status: inviteStatus,
    error: inviteError,
    pendingInviteIds,
    inviteErrors,
    pendingCount,
    onAccept: requestGameInviteAccept,
    onDecline: declineInvite,
    onRefresh: loadInviteSnapshotAndPlayNew,
  }

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
