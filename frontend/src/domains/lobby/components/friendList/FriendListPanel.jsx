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

// 친구 패널 바깥을 덮는 배경 버튼입니다. 클릭하면 패널을 닫습니다.
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

// 친구 목록 패널의 프레임 이미지와 안쪽 콘텐츠 영역입니다.
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

// 친구 패널 안에서 현재 선택된 탭 화면을 보여줍니다.
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

      {/*
        F-19 AC-07 · QA 전용 읽기 전용 진단. 개발 번들 + `?qaInviteSfx=1`일 때만 자기 자신을
        그리고, 그 외에는 null이라 일반 사용자 화면에 아무 영향이 없다. 업무 콜백을 감싸거나
        막지 않는다 — 이미 내려진 판정을 옮겨 적기만 한다.
      */}
      <InviteSfxDiagnosticsPanel />
    </>
  )
}

/**
 * 친구 목록·친구 신청·요청 수락·게임 초대·차단 목록을 모두 조합하는 최종 패널입니다.
 *
 * F-19(AC-01): 이 패널은 **로비와 게임 대기방이 함께 쓰는 하나의 경계**다. 두 화면은 같은
 * 공용 store(friend.store · gameInvite.store)를 구독하므로 같은 계정의 친구·요청·초대
 * 상태를 그대로 본다 — 화면마다 별도 목록을 만들지 않는다.
 *
 * roomId/isRoomVerified를 받으면 대기방 맥락이라는 뜻이고, 그때만 친구 행에 초대 버튼이
 * 붙는다. 검증 전에는 조회는 허용하되 초대 발송은 비활성이고, 호출 경계에서도 다시 막는다.
 */
export default function FriendListPanel({
  open,
  onClose,
  targetRequestId = null,
  targetInviteId = null,
  roomId = null,
  isRoomVerified = false,
}) {
  // 현재 친구 패널 화면입니다. list, request, accept, invite, block 중 하나를 사용합니다.
  const [panelView, setPanelView] = useState("list")

  // F-17(AC-02): 알림에서 특정 친구 요청을 보러 들어오면 "요청 수락" 탭으로 연다.
  // panelView는 이 컴포넌트가 소유하므로(로비가 직접 바꿀 수 없다) 명시적인 선택 입력을
  // 여기서 받아 반영한다. 대상이 사라져도 탭만 열고 아무 요청도 대신 처리하지 않는다.
  useEffect(() => {
    if (!open || targetRequestId == null) return
    setPanelView("accept")
  }, [open, targetRequestId])

  // F-19(AC-07): 초대 알림의 대상 이동도 같은 방식이다 — 탭만 열고 자동 수락하지 않는다.
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

  // ── 게임 초대 ────────────────────────────────────────────────────────────
  const invites = useGameInviteStore((state) => state.invites)
  const inviteStatus = useGameInviteStore((state) => state.status)
  const inviteError = useGameInviteStore((state) => state.error)
  const pendingInviteIds = useGameInviteStore((state) => state.pendingInviteIds)
  const inviteErrors = useGameInviteStore((state) => state.inviteErrors)
  const declineInvite = useGameInviteStore((state) => state.declineInvite)
  const sendInvite = useGameInviteStore((state) => state.sendInvite)

  // 패널을 열 때 초대도 함께 복원한다 — 목록·요청과 같은 경계에서 같은 계정 상태를 본다.
  // 복원 도중에 도착해 버퍼에 남은 **진짜 신규** 초대의 소리도 이 경로가 한 번 처리한다.
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

  /**
   * 대기방에서 친구를 초대한다(AC-06).
   *
   * 방 검증이 끝나기 전에는 **호출 경계에서도** 막는다 — 버튼 비활성만으로는 조작된
   * 클라이언트를 막지 못하고, 마지막 방어선은 서버가 발송자의 실제 방 소속을 다시 확인하는
   * 것이다.
   *
   * 여기서 넘기는 것은 완성된 키가 아니라 **논리 발송의 범위**(방+대상)다. 실제 멱등 키에
   * 붙는 발송 번호는 store가 소유한다 — 결과를 확정하지 못한 재시도는 같은 번호를 유지하고,
   * 서버가 결과를 확정한 뒤의 재초대만 다음 번호로 넘어간다(AC-06).
   */
  const handleSendInvite = useCallback((receiverId) => {
    if (roomId === null || !isRoomVerified) return
    return sendInvite(receiverId, `${roomId}:${receiverId}`)
  }, [roomId, isRoomVerified, sendInvite])

  // F-19(AC-04): 이미 친구인 사람의 차단 진입. 검색은 친구를 후보에서 제외하므로 목록의
  // 행 자체가 유일한 경로다. 해제는 기존 차단 목록 탭이 담당한다.
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
