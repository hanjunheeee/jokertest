/**
 * 인게임 설정 양피지 패널 (prototype: 인게임 설정 프레임_.png)
 * GameSetupPage 중앙 — 탭 전환·설정 목록·게임 만들기 버튼
 *
 * props
 * - visible: true면 입장 연출 후 클릭 허용 (부모 uiVisible과 동기)
 * - isCreating: 방 생성 요청이 진행 중이면 true (게임 만들기 버튼 비활성화용)
 * - onCreateGame: "게임 만들기" 클릭 시 create_room payload를 담아 호출 (부모에서 emit 처리)
 *
 * 에셋은 constants/gameSetupAssets.js, 탭·항목 정의는 constants/gameSetupOptions.js 참고
 */
import { motion } from "framer-motion"
import { useState } from "react"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } from "../constants/gameSetupOptions.js"
import { useSetupTabState } from "../hooks/useSetupTabState.js"
import { buildCreateRoomPayload } from "../utils/buildCreateRoomPayload.js"
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

// 일반+회의&투표 두 탭이 "게임 만들기" 시점에 값을 함께 모을 수 있으려면 같은 상태를
// 공유해야 한다. 각 탭이 따로 useSetupTabState를 부르면 탭을 전환할 때 다른 쪽 탭에서
// 입력한 값을 잃어버리므로, 이 패널에서 두 탭의 항목을 합쳐 한 번만 상태를 만든다.
const ALL_SETUP_ITEMS = [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]

/** 프레임·탭·본문·게임 만들기 버튼을 묶는 설정 패널 */
export default function GameSetupPanel({ visible, isCreating, onCreateGame }) {
  // 현재 선택된 설정 탭 id입니다.
  const [activeTab, setActiveTab] = useState("general")
  const { checks, ranges, setCheck, setRange } = useSetupTabState(ALL_SETUP_ITEMS)

  const handleCreateClick = () => {
    onCreateGame(buildCreateRoomPayload({ checks, ranges }))
  }

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
                <GeneralGameSetupTab checks={checks} ranges={ranges} setCheck={setCheck} setRange={setRange} />
              ) : ( // 회의&투표 탭
                <MeetingGameSetupTab checks={checks} ranges={ranges} setCheck={setCheck} setRange={setRange} />
              )}
            </div>
          </div>
        </div>

        <GameSetupCreateButton onClick={handleCreateClick} disabled={isCreating} />
      </motion.div>
    </div>
  )
}
