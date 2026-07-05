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
import {
  GAME_SETUP_ASSETS,
  GAME_SETUP_TABS,
} from "../constants/gameSetupAssets.js"
import GeneralGameSetupTab from "./GeneralGameSetupTab.jsx"
import MeetingGameSetupTab from "./MeetingGameSetupTab.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

const PANEL_WRAP_CLASS =
  "absolute left-1/2 top-[48%] z-20 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.82]"

const PANEL_CLASS =
  "flex w-[min(76rem,96vw)] flex-col items-center"

const TAB_BTN_CLASS =
  "interactive-scale relative w-[clamp(21rem,45vw,27rem)] shrink-0 leading-none"

const TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-subheading text-[clamp(1.35rem,1.95vw,1.58rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 인게임 설정 프레임_.png — 상단 탭 + 양피지 본문 (프레임 내부) */
const FRAME_OVERLAY_INSET = {
  paddingTop: "3.75%",
  paddingBottom: "6.5%",
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
}

const TAB_NAV_CLASS =
  "mb-[clamp(0.15rem,0.35vh,0.25rem)] flex shrink-0 flex-nowrap items-center justify-center gap-[clamp(0.25rem,0.5vw,0.4rem)] overflow-visible -translate-y-[clamp(0.6rem,1.6vh,0.95rem)]"

/** 탭과 분리 — 설정 목록(일반·회의&투표 본문)만 아래로 */
const SETUP_CONTENT_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip pr-1 pt-[clamp(4rem,5vh,6rem)]"

const CREATE_GAME_BTN_CLASS =
  "interactive-scale relative mx-auto mt-[clamp(0.55rem,1.2vh,0.85rem)] block w-[clamp(13.5rem,20vw,17.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

const CREATE_GAME_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading text-[clamp(1.22rem,1.75vw,1.42rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 상단 탭 버튼 한 개 — 활성·비활성 이미지 전환 */
function SetupTab({ tab, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      className={TAB_BTN_CLASS}
      aria-pressed={active}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={active ? GAME_SETUP_ASSETS.tabActive : GAME_SETUP_ASSETS.tabInactive}
        alt=""
        className="block h-auto w-full max-h-none select-none object-contain"
      />
      <span className={TAB_LABEL_CLASS}>{tab.label}</span>
    </button>
  )
}

/** 프레임·탭·본문·게임 만들기 버튼을 묶는 설정 패널 */
export default function GameSetupPanel({ visible, onCreateGame }) {
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅입니다.
  // 값을 바꾸는 함수(setActiveTab)를 호출하면 컴포넌트가 다시 렌더링되어 화면이 갱신됩니다.
  // activeTab: 현재 선택된 탭의 id
  const [activeTab, setActiveTab] = useState("general") // general | meeting

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
          <nav className={TAB_NAV_CLASS} aria-label="인게임 설정 탭">
            {GAME_SETUP_TABS.map((tab) => (
              <SetupTab
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onSelect={setActiveTab}
              />
            ))}
          </nav>

          <div className={SETUP_CONTENT_CLASS}>
            {activeTab === "general" ? ( // 일반 탭
              <GeneralGameSetupTab />
            ) : ( // 회의&투표 탭
              <MeetingGameSetupTab />
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="게임 만들기"
        onClick={onCreateGame}
        className={CREATE_GAME_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={GAME_SETUP_ASSETS.createGameButton}
          alt=""
          className="block h-auto w-full select-none"
        />
        <span className={CREATE_GAME_LABEL_CLASS}>게임 만들기</span>
      </button>
      </motion.div>
    </div>
  )
}
