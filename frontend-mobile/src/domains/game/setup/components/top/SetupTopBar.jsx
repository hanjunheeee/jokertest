// 방 설정 위 줄: 뒤로 가기·소리 조절 (데스크톱은 왼쪽 아래·오른쪽 아래 구석, 제목 글은 데스크톱에 없어서 안 씀)
// pages/GameSetupPage가 씀
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

// 위 줄 (데스크톱 뒤로 버튼처럼 아래에서 살짝 올라오며 나타남), 뒤로 효과음은 useGameSetupPage가 직접 내서 sfxOwner
export default function SetupTopBar({ visible, onBack }) {
  return (
    <motion.header
      className="flex h-13 shrink-0 items-center justify-between gap-2 land:h-11"
      initial={{ opacity: 0, y: 8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <BackButton
        onClick={onBack}
        label="멀티플레이 선택으로 돌아가기"
        sfxOwner
        className="group flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0"
        iconClassName="block w-11 select-none transition-transform group-active:scale-90"
      />
      <SoundControl look="setup" />
    </motion.header>
  )
}
