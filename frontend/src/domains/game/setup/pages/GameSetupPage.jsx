/**
 * 인게임 설정(게임 만들기) 화면.
 *
 * page 계층은 컴포넌트 조합과 네비게이션 제어만 담당합니다.
 * - 설정 패널 → GameSetupPanel (visible·onCreateGame 수신)
 *
 * uiVisible: requestAnimationFrame 다음 프레임에서 true로 전환하여
 *   마운트 직후 입장 애니메이션이 자연스럽게 시작되도록 합니다.
 */
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import GameSetupPanel from "../components/GameSetupPanel.jsx"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION, UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function GameSetupPage() {
  const navigate = useNavigate()
  const [uiVisible, setUiVisible] = useState(false) // true가 되면 패널·버튼 입장 애니메이션 시작

  // 다음 프레임에서 uiVisible 전환 — 마운트 직후 즉시 전환 시 transition이 무시됨
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(GAME_SETUP_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      {/* uiVisible을 visible로 전달 — 패널 내부에서 입장 애니메이션 처리 */}
      <GameSetupPanel
        visible={uiVisible}
        onCreateGame={() => navigate("/game-matching")} // 설정 완료 → 매칭 대기 화면으로 이동
      />

      <div className="absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <SoundControl />
      </div>

      <MotionBackButton
        ariaLabel="멀티플레이 선택으로 돌아가기"
        initial={{ opacity: 0, y: 8 }}
        animate={uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/multiplay")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }} // 애니메이션 중 클릭 차단
      />
    </div>
  )
}
