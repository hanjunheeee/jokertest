// 인게임 배경: 낮 그림과 밤 그림을 겹쳐 두고 단계 따라 서서히 바꿈
// InGamePage가 맨 뒤에 깖, 데스크톱 InGameBackground와 같은 그림·전환
// 모바일: 입력줄이 shell 바닥 portal이라 fixed로 화면 전체(아래 크롬 포함)를 채움
import { motion } from "framer-motion"
import {
  INGAME_ASSETS,
  INGAME_BG_OVERLAY_OPACITY,
} from "@/domains/game/ingame/constants/ingameAssets.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

const ROOT_CLASS = "pointer-events-none fixed inset-0 z-0 bg-black"
const IMG_CLASS = "absolute inset-0 h-full w-full select-none object-cover object-center"

// 밤이면 밤 그림만 보이게
export default function Background() {
  const isNight = useInGameStore((s) => s.state?.phase === "NIGHT")

  return (
    <div className={ROOT_CLASS} aria-hidden="true">
      <motion.img
        src={publicAsset(INGAME_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: isNight ? 0 : INGAME_BG_OVERLAY_OPACITY }}
        transition={BG_FADE_TRANSITION}
        className={IMG_CLASS}
        draggable={false}
      />
      <motion.img
        src={publicAsset(INGAME_ASSETS.bgNight)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: isNight ? INGAME_BG_OVERLAY_OPACITY : 0 }}
        transition={BG_FADE_TRANSITION}
        className={IMG_CLASS}
        draggable={false}
      />
    </div>
  )
}