// 인게임 배경: 낮 그림과 밤 그림을 겹쳐 두고 단계 따라 서서히 바꿈
// InGamePage가 맨 뒤에 깖, 데스크톱 InGameBackground와 같은 그림·전환
import { motion } from "framer-motion"
import { INGAME_ASSETS } from "@/domains/game/ingame/constants/ingameAssets.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 두 그림 공통 모양 (세로 화면이라 가운데 기준으로 잘라 채움)
const IMG_CLASS = "absolute inset-0 h-full w-full select-none object-cover object-center"

// 밤이면 밤 그림만 보이게
export default function Background() {
  const isNight = useInGameStore((s) => s.state?.phase === "NIGHT")

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <motion.img
        src={publicAsset(INGAME_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: isNight ? 0 : 1 }}
        transition={BG_FADE_TRANSITION}
        className={IMG_CLASS}
        draggable={false}
      />
      <motion.img
        src={publicAsset(INGAME_ASSETS.bgNight)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: isNight ? 1 : 0 }}
        transition={BG_FADE_TRANSITION}
        className={IMG_CLASS}
        draggable={false}
      />
      {/* 글자·버튼이 그림 위에서 읽히게 살짝 어둡게 */}
      <div className="absolute inset-0 bg-black/35" />
    </div>
  )
}
