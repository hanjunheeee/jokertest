/**
 * 인게임 설정(게임 만들기) 화면 (prototype: 화면 구성-일반UI)
 * MultiplayEntryPage에서 "게임 만들기" 선택 시 진입
 *
 * - 뒤로가기 → /multiplay
 * - 게임 만들기 → /game-matching (설정값 저장·API 연동은 GameSetupPanel 내부 state만 사용)
 *
 * UI 구성: GameSetupPanel(탭·설정 목록·게임 만들기 버튼), SoundControl(우하단),
 *          MotionBackButton(좌하단), 배경 이미지
 * 에셋은 constants/gameSetupAssets.js 참고
 */
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import GameSetupPanel from "../components/GameSetupPanel.jsx"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import {
  BACK_BUTTON_PAGE_POSITION_CLASS,
  MotionBackButton,
} from "@/shared/ui/BackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

/** 배경·설정 패널·공통 UI를 묶는 인게임 설정 페이지 */
export default function GameSetupPage() {
  const navigate = useNavigate()
  const [uiVisible, setUiVisible] = useState(false) // true면 패널·뒤로가기 입장 연출 및 클릭 허용

  // 프레임 연출 관련 상태값 함수
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

      <GameSetupPanel
        visible={uiVisible}
        onCreateGame={() => navigate("/game-matching")} // 설정 확인 후 매칭 화면으로
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
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      />
    </div>
  )
}
