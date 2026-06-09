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
  MATCHING_PARTY_FOOTER_CLASS,
  MATCHING_PARTY_ICON_CLASS,
  MATCHING_PARTY_TEXT_CLASS,
} from "../constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"
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
        className={MATCHING_PARTY_FOOTER_CLASS}
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

      <motion.button
        type="button"
        aria-label="인게임 설정으로 돌아가기"
        initial={{ opacity: 0, y: 8 }}
        animate={uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/game-setup")}
        className="absolute bottom-[2.5%] left-[2.5%] z-30 block w-[clamp(4.75rem,7.5vw,6.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:left-[3%]"
        style={{ pointerEvents: uiVisible ? "auto" : "none", outline: "none" }}
      >
        <PublicAsset
          src={GAME_MATCHING_ASSETS.backButton}
          alt=""
          className="block h-auto w-full select-none"
        />
      </motion.button>
    </div>
  )
}
