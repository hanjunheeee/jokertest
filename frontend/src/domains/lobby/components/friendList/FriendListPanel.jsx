/**
 * 친구 목록 패널.
 *
 * 친구 목록/친구 신청/받은 요청 탭을 포함하는 로비 우측 패널입니다.
 */
import { AnimatePresence, motion } from "framer-motion"
import { useState } from "react"
import { FRIEND_LIST_ASSETS } from "../../constants/friendListAssets.js"
import FriendAcceptTab from "./accept/FriendAcceptTab.jsx"
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

const FRIEND_ACTION_BTN_CLASS =
  "group block w-[clamp(2.45rem,3.6vw,3rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

const FRIEND_ACTION_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.9]"

const FRAME_CORNER_BTN_POS =
  "pointer-events-auto absolute right-[clamp(2.35rem,14%,3.1rem)] bottom-[clamp(2.1rem,12%,2.85rem)] z-20"

function FriendActionButtons({ onRequestClick, onAcceptClick }) {
  return (
    <div
      className={`${FRAME_CORNER_BTN_POS} flex items-end gap-[clamp(0.3rem,0.65vw,0.45rem)]`}
      aria-label="친구 신청 및 수락"
    >
      <button
        type="button"
        onClick={onRequestClick}
        className={FRIEND_ACTION_BTN_CLASS}
        aria-label="친구 신청"
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={FRIEND_LIST_ASSETS.friendRequestButton}
          alt=""
          className={FRIEND_ACTION_BTN_IMG_CLASS}
        />
      </button>
      <button
        type="button"
        onClick={onAcceptClick}
        className={FRIEND_ACTION_BTN_CLASS}
        aria-label="친구 수락"
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={FRIEND_LIST_ASSETS.friendAcceptButton}
          alt=""
          className={FRIEND_ACTION_BTN_IMG_CLASS}
        />
      </button>
    </div>
  )
}

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
              {panelView === "list" ? (
                <FriendListTabContent 
                  onlineFriends={onlineFriends}
                  offlineFriends={offlineFriends}
                  favoriteFriends={favoriteFriends}
                />
              ) : null}

              {panelView === "request" ? (
                <FriendRequestTab 
                  onBack={() => setPanelView("list")} 
                  recommendedFriends={[]} 
                />
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

            {panelView === "list" ? (
              <FriendActionButtons
                onRequestClick={() => setPanelView("request")}
                onAcceptClick={() => setPanelView("accept")}
              />
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
