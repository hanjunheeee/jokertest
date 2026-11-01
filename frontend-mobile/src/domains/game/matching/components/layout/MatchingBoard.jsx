// 대기방 가운데 판: 위 줄(방장 버튼·초대코드 공유) + 매칭 팝업 틀 그림(제목·안내 글·자리 그림·기다림 글)
// GameMatchingPage가 씀, 틀·글·자리는 데스크톱 MatchingPopupPanel·MatchingPopupContent 그대로 (아래 버튼 줄만 바닥으로 뺌)
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import SlotGrid from "../slots/SlotGrid.jsx"
import {
  BOARD_PROMPT_CLASS,
  BOARD_TITLE_CLASS,
  BOARD_WAITING_CLASS,
  ROOM_CODE_BUTTON_LOOK,
} from "../../constants/matchingMobileStyles.js"

// 틀 장식을 피한 안쪽 여백 (데스크톱 CONTENT_INSET, 아래는 버튼 줄이 빠져서 줄임 / % = 틀 폭 기준)
const CONTENT_INSET = { paddingTop: "14%", paddingBottom: "10%", paddingLeft: "11%", paddingRight: "11%" }

// 틀 폭: 폰 세로는 화면 폭, 폰 가로는 남는 높이에 맞춤 (틀 그림 823x608)
const FRAME_WIDTH_CLASS =
  "w-full max-w-[40rem] land:w-[min(100%,calc((100svh-9.75rem)*1.354))]"

// 가운데 판 (leading = 위 줄 왼쪽 방장 버튼), visible 따라 서서히 드러남
export default function MatchingBoard({ visible, slots, waitingMessage = "", onRoomCodeOpen, leading = null }) {
  return (
    <div className={`mx-auto flex flex-col gap-1.5 ${FRAME_WIDTH_CLASS}`}>
      <div className="flex min-h-11 items-center justify-between gap-1.5">
        {leading}
        {/* 초대코드 공유 (누르면 방코드 창, 데스크톱 틀 오른쪽 위 버튼) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={UI_REVEAL_TRANSITION}
          style={{ pointerEvents: visible ? "auto" : "none" }}
        >
          <ImageButton
            look={ROOM_CODE_BUTTON_LOOK}
            label="초대코드 공유"
            src={GAME_MATCHING_ASSETS.roomCodeViewButton}
            onClick={onRoomCodeOpen}
          />
        </motion.div>
      </div>

      <motion.div
        className="relative w-full [container-type:inline-size]"
        initial={{ opacity: 0, y: 12 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={UI_REVEAL_TRANSITION}
        style={{ pointerEvents: visible ? "auto" : "none" }}
      >
        <PublicAsset
          src={GAME_MATCHING_ASSETS.popupFrame}
          alt={MATCHING_POPUP_COPY.title}
          className="pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
        />
        <p className={BOARD_TITLE_CLASS}>{MATCHING_POPUP_COPY.title}</p>

        <div className="absolute inset-0 flex min-h-0 flex-col items-stretch overflow-hidden" style={CONTENT_INSET}>
          <p className={BOARD_PROMPT_CLASS}>{MATCHING_POPUP_COPY.prompt}</p>
          <SlotGrid slots={slots} />
          {/* 기다림 문구 있을 때만 (파티 방 기다리는 중) */}
          {waitingMessage ? <p className={BOARD_WAITING_CLASS}>{waitingMessage}</p> : null}
        </div>
      </motion.div>
    </div>
  )
}
