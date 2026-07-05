/**
 * 친구 목록 패널.
 *
 * 친구 목록/친구 신청/받은 요청 탭을 포함하는 로비 우측 패널입니다.
 */
import { AnimatePresence, motion } from "framer-motion"
import { useState } from "react"
import { FRIEND_LIST_ASSETS } from "../../constants/friendListAssets.js"
import FriendAcceptTab from "./accept/FriendAcceptTab.jsx"
import FriendListViewTabs from "./common/FriendListViewTabs.jsx"
import FriendListTabContent from "./list/FriendListTabContent.jsx"
import FriendRequestTab from "./request/FriendRequestTab.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

function panelAriaLabel(view) {
  if (view === "request") return "친구 신청"
  if (view === "accept") return "친구 수락"
  return "친구 목록"
}

const PANEL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

const PANEL_CLASS =
  "absolute right-0 top-[2.5%] bottom-[clamp(7.5rem,13vh,10.5rem)] z-30 w-[clamp(17.5rem,22.5vw,25.5rem)] max-w-[26rem] sm:bottom-[clamp(8rem,14vh,11rem)]"

const PANEL_INSET = {
  paddingTop: "clamp(4rem, 17%, 5.3rem)",
  paddingBottom: "clamp(2.75rem, 11%, 3.5rem)",
  paddingLeft: "10.5%",
  paddingRight: "10.5%",
}

// open: 패널이 열려 있는지 여부 (AnimatePresence로 열림/닫힘 애니메이션 처리)
// onClose: 배경 클릭 등으로 패널을 닫을 때 호출할 콜백
// onlineFriends/offlineFriends/favoriteFriends: 목록 탭에 표시할 친구 그룹 배열
// incomingRequests: 수락 탭에 표시할 받은 친구 요청 배열
// onRefreshRequests/onAcceptRequest/onDeclineRequest/onAcceptAll:
//   각각 새로고침·수락·거절·전체 수락 버튼 클릭 시 실행할 콜백 (useFriendListSync에서 내려옴)
export default function FriendListPanel({
  open,
  onClose,
  onlineFriends = [],
  offlineFriends = [],
  favoriteFriends = [],
  incomingRequests = [],
  onRefreshRequests,
  onAcceptRequest,
  onDeclineRequest,
  onAcceptAll,
}) {
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅입니다.
  // panelView: 패널 내부에서 현재 보여줄 화면 ("list" | "request" | "accept")
  const [panelView, setPanelView] = useState("list")

  const handleClose = () => {
    setPanelView("list")
    onClose()
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="친구 목록 닫기"
            className="absolute inset-0 z-20 cursor-default border-0 bg-black/25 p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PANEL_TRANSITION}
            onClick={handleClose}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={panelAriaLabel(panelView)}
            className={PANEL_CLASS}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={PANEL_TRANSITION}
            onClick={(event) => event.stopPropagation()}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.panelFrame}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
            />

            <div
              className="relative flex h-full min-h-0 flex-col"
              style={PANEL_INSET}
            >
              <FriendListViewTabs
                activeView={panelView}
                onRequestClick={() => setPanelView("request")}
                onAcceptClick={() => setPanelView("accept")}
              />

              {panelView === "list" ? (
                <FriendListTabContent
                  onlineFriends={onlineFriends}
                  offlineFriends={offlineFriends}
                  favoriteFriends={favoriteFriends}
                />
              ) : null}

              {panelView === "request" ? (
                <FriendRequestTab onBack={() => setPanelView("list")} />
              ) : null}

              {panelView === "accept" ? (
                <FriendAcceptTab
                  onBack={() => setPanelView("list")}
                  incomingRequests={incomingRequests}
                  onAccept={onAcceptRequest}
                  onDecline={onDeclineRequest}
                  onAcceptAll={onAcceptAll}
                  onRefresh={onRefreshRequests}
                />
              ) : null}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
