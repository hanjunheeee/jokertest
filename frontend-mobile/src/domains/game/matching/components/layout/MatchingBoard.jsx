// 대기방 가운데 양피지 판: 제목 띠·안내 문구·초대코드 공유 버튼·자리 격자
// GameMatchingPage가 씀, 데스크톱 매칭 팝업(가로 틀 그림)을 세로 판으로 바꿈
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import ImageButton from "../common/ImageButton.jsx"
import SlotGrid from "../slots/SlotGrid.jsx"
import { PARCHMENT_CLASS, ROOM_CODE_COPY } from "../../constants/matchingMobileStyles.js"

// 가운데 판 (visible 따라 서서히 드러남)
export default function MatchingBoard({ visible, cards, waitingMessage, onRoomCodeOpen }) {
  return (
    <motion.section
      aria-label={MATCHING_POPUP_COPY.title}
      className={`${PARCHMENT_CLASS} relative mx-auto flex w-full max-w-[40rem] flex-col land:max-w-[48rem] lg:max-w-[56rem] gap-3 px-3 pt-3 pb-4 land:gap-2 land:pt-2 land:pb-3`}
      initial={{ opacity: 0, y: 12 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {/* 제목 띠 (데스크톱 팝업 위 붉은 띠 느낌) */}
      <h1 className="mx-auto rounded-md border border-[#3a2418] bg-gradient-to-b from-[#6b3b2c] to-[#3f2219] px-5 py-1.5 text-center font-display app-text-scaled [--app-text-size:1.35rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)] land:[--app-text-size:1.1rem]">
        {MATCHING_POPUP_COPY.title}
      </h1>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 basis-[12rem] font-subheading app-text-scaled [--app-text-size:0.92rem] font-bold leading-snug text-[#1a1008]">
          {MATCHING_POPUP_COPY.prompt}
        </p>
        {/* 초대코드 공유 (누르면 방코드 시트) */}
        <ImageButton
          label={ROOM_CODE_COPY.open}
          src={GAME_MATCHING_ASSETS.roomCodeViewButton}
          onClick={onRoomCodeOpen}
          className="h-11 w-[8.5rem] shrink-0"
        />
      </div>

      <SlotGrid cards={cards} waitingMessage={waitingMessage} />
    </motion.section>
  )
}
