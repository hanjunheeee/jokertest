/**
 * 인게임 설정 양피지 패널 (prototype: 인게임 설정 프레임_.png)
 * GameSetupPage 중앙 — 탭 전환·설정 목록·게임 만들기 버튼
 *
 * props
 * - visible: true면 입장 연출 후 클릭 허용 (부모 uiVisible과 동기)
 * - onCreateGame: "게임 만들기" 클릭 시 호출 (부모에서 라우팅)
 *
 * 에셋·탭·항목 정의는 constants/gameSetupAssets.js 참고
 */
import { motion } from "framer-motion"
import { useState } from "react"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import GameSetupCreateButton from "./GameSetupCreateButton.jsx"
import GameSetupTabs from "./GameSetupTabs.jsx"
import GeneralGameSetupTab from "./GeneralGameSetupTab.jsx"
import MeetingGameSetupTab from "./MeetingGameSetupTab.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

const PANEL_WRAP_CLASS =
  "absolute left-1/2 top-[48%] z-20 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.82]"

const PANEL_CLASS =
  "flex w-[min(76rem,96vw)] flex-col items-center"

/** 인게임 설정 프레임_.png — 상단 탭 + 양피지 본문 (프레임 내부) */
const FRAME_OVERLAY_INSET = {
  paddingTop: "3.75%",
  paddingBottom: "6.5%",
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
}

/** 탭과 분리 — 설정 목록(일반·회의&투표 본문)만 아래로 */
const SETUP_CONTENT_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip pr-1 pt-[clamp(4rem,5vh,6rem)]"

/** 프레임·탭·본문·게임 만들기 버튼을 묶는 설정 패널 */
export default function GameSetupPanel({ visible, onCreateGame }) {
  // 현재 선택된 설정 탭 id입니다.
  const [activeTab, setActiveTab] = useState("general")

  return (
    <div
      className={PANEL_WRAP_CLASS}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <motion.div
        className={PANEL_CLASS}
        initial={{ opacity: 0, y: 12 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={UI_REVEAL_TRANSITION}
      >
        <div className="relative">
          <PublicAsset
            src={GAME_SETUP_ASSETS.frame}
            alt="인게임 설정"
            className="pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
          />

          <div
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
            style={FRAME_OVERLAY_INSET}
          >
            <GameSetupTabs activeTab={activeTab} onSelect={setActiveTab} />

            <div className={SETUP_CONTENT_CLASS}>
              {activeTab === "general" ? ( // 일반 탭
                <GeneralGameSetupTab />
              ) : ( // 회의&투표 탭
                <MeetingGameSetupTab />
              )}
            </div>
          </div>
        </div>

        <GameSetupCreateButton onClick={onCreateGame} />
      </motion.div>
    </div>
  )
}
