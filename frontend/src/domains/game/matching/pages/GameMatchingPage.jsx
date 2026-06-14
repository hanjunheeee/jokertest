import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import MatchingPopupPanel from "../components/MatchingPopupPanel.jsx"
import RoomCodeViewModal from "../components/RoomCodeViewModal.jsx"
import {
  GAME_MATCHING_ASSETS,
  MATCHING_PARTY_SLOTS_DUMMY_10,
  MATCHING_POPUP_COPY,
  MATCHING_ROOM_CODE_DUMMY,
} from "../constants/gameMatchingAssets.js"
import {
  MATCHING_PARTY_COUNT_CLASS,
  MATCHING_PARTY_HEADER_CLASS,
  MATCHING_PARTY_ICON_CLASS,
  MATCHING_PARTY_TEXT_CLASS,
} from "../constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  BACK_BUTTON_PAGE_POSITION_CLASS,
  MotionBackButton,
} from "@/shared/ui/BackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

export default function GameMatchingPage() {
  const navigate = useNavigate()
  const [uiVisible, setUiVisible] = useState(false)
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)
  const partyCount = MATCHING_PARTY_SLOTS_DUMMY_10.length

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(GAME_MATCHING_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: uiVisible ? 1 : 0 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <MatchingPopupPanel
        visible={uiVisible}
        slots={MATCHING_PARTY_SLOTS_DUMMY_10}
        onRoomCodeView={() => setRoomCodeOpen(true)}
      />

      <RoomCodeViewModal
        open={roomCodeOpen}
        onClose={() => setRoomCodeOpen(false)}
        roomCode={MATCHING_ROOM_CODE_DUMMY}
      />

      <motion.div
        className={MATCHING_PARTY_HEADER_CLASS}
        initial={{ opacity: 0 }}
        animate={uiVisible ? { opacity: 1 } : { opacity: 0 }}
        transition={UI_REVEAL_TRANSITION}
        aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
      >
        <PublicAsset
          src={GAME_MATCHING_ASSETS.silhouetteNotReady}
          alt=""
          className={MATCHING_PARTY_ICON_CLASS}
        />
        <span className={MATCHING_PARTY_TEXT_CLASS}>
          {MATCHING_POPUP_COPY.partyLabel}{" "}
          <span className={MATCHING_PARTY_COUNT_CLASS}>{partyCount}</span>명
        </span>
      </motion.div>

      <div className="absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <SoundControl />
      </div>

      <MotionBackButton
        ariaLabel="인게임 설정으로 돌아가기"
        initial={{ opacity: 0, y: 8 }}
        animate={uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/game-setup")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      />
    </div>
  )
}
