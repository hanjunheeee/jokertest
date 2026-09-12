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
import { useEffect, useState } from "react"
import { getFriendPanelAriaLabel } from "@/domains/lobby/utils/friendListPanelAria.js"
import { useFriendListSync } from "@/domains/lobby/hooks/useFriendListSync.js"
import FriendAcceptTab from "@/domains/lobby/components/friendList/accept/FriendAcceptTab.jsx"
import FriendListTabContent from "@/domains/lobby/components/friendList/list/FriendListTabContent.jsx"
import FriendListViewTabs from "@/domains/lobby/components/friendList/FriendListViewTabs.jsx"
import FriendRequestTab from "@/domains/lobby/components/friendList/request/FriendRequestTab.jsx"
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
  onlineFriends,
  offlineFriends,
  favoriteFriends,
  incomingRequests,
  onRefreshRequests,
  onAcceptRequest,
  onDeclineRequest,
  onAcceptAll,
  targetRequestId,
}) {
  return (
    <>
      <FriendListViewTabs
        activeView={panelView}
        onRequestClick={onRequestView}
        onAcceptClick={onAcceptView}
      />

      {panelView === "list" ? (
        <FriendListTabContent
          onlineFriends={onlineFriends}
          offlineFriends={offlineFriends}
          favoriteFriends={favoriteFriends}
        />
      ) : null}

      {panelView === "request" ? (
        <FriendRequestTab onBack={onListView} />
      ) : null}

      {panelView === "accept" ? (
        <FriendAcceptTab
          onBack={onListView}
          incomingRequests={incomingRequests}
          onAccept={onAcceptRequest}
          onDecline={onDeclineRequest}
          onAcceptAll={onAcceptAll}
          onRefresh={onRefreshRequests}
          targetRequestId={targetRequestId}
        />
      ) : null}
    </>
  )
}

// 친구 목록, 친구 신청, 요청 수락 탭을 모두 조합하는 최종 패널입니다.
// 친구 데이터/핸들러는 이 패널이 open 여부를 이미 알고 있으므로 여기서 직접
// useFriendListSync로 구독합니다 — LobbyPage/LobbyFriendArea가 그대로 통과만
// 시키던 8개의 prop을 두 파일에서 걷어냈습니다.
export default function FriendListPanel({ open, onClose, targetRequestId = null }) {
  // 현재 친구 패널 화면입니다. list, request, accept 중 하나를 사용합니다.
  const [panelView, setPanelView] = useState("list")

  // F-17(AC-02): 알림에서 특정 친구 요청을 보러 들어오면 "요청 수락" 탭으로 연다.
  // panelView는 이 컴포넌트가 소유하므로(로비가 직접 바꿀 수 없다) 명시적인 선택 입력을
  // 여기서 받아 반영한다. 대상이 사라져도 탭만 열고 아무 요청도 대신 처리하지 않는다.
  useEffect(() => {
    if (!open || targetRequestId == null) return
    setPanelView("accept")
  }, [open, targetRequestId])

  const {
    onlineFriends,
    offlineFriends,
    favoriteFriends,
    incomingRequests,
    handleRefreshFriends,
    handleAcceptRequest,
    handleDeclineRequest,
    handleAcceptAll,
  } = useFriendListSync(open)

  const showListView = () => setPanelView("list")
  const showRequestView = () => setPanelView("request")
  const showAcceptView = () => setPanelView("accept")

  const handleClose = () => {
    showListView()
    onClose()
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
              onlineFriends={onlineFriends}
              offlineFriends={offlineFriends}
              favoriteFriends={favoriteFriends}
              incomingRequests={incomingRequests}
              onRefreshRequests={handleRefreshFriends}
              onAcceptRequest={handleAcceptRequest}
              onDeclineRequest={handleDeclineRequest}
              onAcceptAll={handleAcceptAll}
              targetRequestId={targetRequestId}
            />
          </FriendListPanelFrame>
        </>
      ) : null}
    </AnimatePresence>
  )
}
