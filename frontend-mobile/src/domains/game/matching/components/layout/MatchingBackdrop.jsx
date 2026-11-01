// 대기방 배경 그림 (덮개 없음, 데스크톱 MatchingBackground와 같음)
// GameMatchingPage가 씀, 화면 드러날 때 서서히 밝아짐
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 배경 (페이지 스크롤과 상관없이 화면에 고정, 바탕은 데스크톱처럼 검정)
export default function MatchingBackdrop({ visible }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden bg-black">
      <motion.img
        src={publicAsset(GAME_MATCHING_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />
    </div>
  )
}
