// 인게임 배경: 낮 그림과 밤 그림을 겹쳐 두고 단계 따라 서서히 바꿈
// 인게임 화면·재판 연출 미리보기 화면이 사용
import { motion } from "framer-motion"
import { INGAME_ASSETS } from "../constants/ingameAssets.js"
import { useInGameStore } from "../store/ingameStore.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 두 배경 그림이 같이 쓰는 모양 (화면 꽉 채움)
const INGAME_BG_IMAGE_CLASS = "absolute inset-0 h-full w-full object-cover object-center"

// 밤이면 밤 그림만 보이게, 처음 뜰 때도 서서히 나타남
export default function InGameBackground() {
  const phase = useInGameStore((s) => s.state?.phase)
  const isNight = phase === "NIGHT"

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <motion.img
        src={publicAsset(INGAME_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: isNight ? 0 : 1 }}
        transition={BG_FADE_TRANSITION}
        className={INGAME_BG_IMAGE_CLASS}
        draggable={false}
      />
      <motion.img
        src={publicAsset(INGAME_ASSETS.bgNight)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: isNight ? 1 : 0 }}
        transition={BG_FADE_TRANSITION}
        className={INGAME_BG_IMAGE_CLASS}
        draggable={false}
      />
    </div>
  )
}
