// 모드 화면 배경 그림 (화면 전체에 고정, 내용만 스크롤)
// 모드 선택·방 목록·방 코드 페이지가 씀
import { motion } from "framer-motion"
import { MODE_SCREEN_ASSETS } from "@/domains/game/mode/constants/modeAssets.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 배경 그림만 (데스크톱처럼 덮개 없음), fade면 방 코드 화면처럼 서서히 나타남
export default function ModeBackdrop({ src = MODE_SCREEN_ASSETS.bg, fade = false }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 bg-black" aria-hidden="true">
      <motion.img
        src={publicAsset(src)}
        alt=""
        initial={fade ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="h-full w-full object-cover object-center"
        draggable={false}
      />
    </div>
  )
}
