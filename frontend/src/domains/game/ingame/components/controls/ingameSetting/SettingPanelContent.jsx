/**
 * 인게임 설정 — 본문 (헤더 + 탭 + 탭별 설정)
 */
import { useRef } from "react"
import {
  INGAME_SETTING_SCROLL_CLASS,
  INGAME_SETTING_SCROLL_WRAP_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import { useInGameSettingIsHost } from "../../../hooks/useInGameSettingIsHost.js"
import { useInGameSettingPanel } from "../../../hooks/useInGameSettingPanel.js"
import SettingChatTab from "./SettingChatTab.jsx"
import SettingRoomTab from "./SettingRoomTab.jsx"
import SettingSoundTab from "./SettingSoundTab.jsx"
import SettingTabs from "./SettingTabs.jsx"
import SidePanelHeader from "../SidePanelHeader.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

function SettingTabPanel({
  activeTab, onOpenKickPlayer, onOpenRoomCode, volumes, onVolumeChange, sfxMuted, onSfxMutedChange,
}) {
  if (activeTab === "chat") return <SettingChatTab />
  if (activeTab === "room") {
    return <SettingRoomTab onOpenKickPlayer={onOpenKickPlayer} onOpenRoomCode={onOpenRoomCode} />
  }
  return (
    <SettingSoundTab
      volumes={volumes}
      onVolumeChange={onVolumeChange}
      sfxMuted={sfxMuted}
      onSfxMutedChange={onSfxMutedChange}
    />
  )
}

/**
 * F-24(AC-01): 방장이 아닌 참가자의 방 코드 보기 진입.
 *
 * 방관리 탭은 방장 전용이라(INGAME_SETTING_TABS의 hostOnly) 그 안의 "방 코드 보기" 행은
 * 비방장에게 보이지 않는다. 그런데 방 코드는 방장만의 비밀이 아니다 — 그 판의 참가자는 이미
 * 그 코드로 들어왔거나 초대를 받았다. 그래서 탭 밖 공통 영역에 같은 모달로 가는 진입을 하나
 * 둔다(방장은 방관리 탭의 행을 쓰므로 여기서는 그리지 않는다 — 같은 화면에 같은 버튼이 둘일
 * 이유가 없다).
 */
const COMMON_ACTION_WRAP_CLASS = "px-[1.15rem] pb-[0.9rem] pt-[0.2rem]"
const COMMON_ACTION_BTN_CLASS =
  "cursor-pointer border-0 bg-transparent p-0 font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.15vw,1rem)] font-semibold text-[#f5e6c8] underline decoration-dotted underline-offset-4"

export default function SettingPanelContent({ onOpenKickPlayer, onOpenRoomCode }) {
  const scrollRef = useRef(null)
  const isHost = useInGameSettingIsHost()
  // F-16(AC-03): 효과음 음소거는 설정 화면과 같은 store 값이다 — 두 UI 입력 → 하나의 store →
  // settings-storage → 공통 재생기의 설정 구독 → 현재 매체와 mix 구독자 순서로 반영된다.
  const { activeTab, setActiveTab, visibleTabs, volumes, setVolume, sfxMuted, setSfxMuted } =
    useInGameSettingPanel({ isHost })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidePanelHeader
        title="설정"
        subtitle="게임 중 빠르게 변경할 수 있는 설정입니다."
      />

      <SettingTabs tabs={visibleTabs} activeTab={activeTab} onSelect={setActiveTab} />

      {isHost ? null : (
        <div className={COMMON_ACTION_WRAP_CLASS}>
          <button type="button" className={COMMON_ACTION_BTN_CLASS} onClick={() => onOpenRoomCode?.()}>
            방 코드 보기
          </button>
        </div>
      )}

      <div className={`${INGAME_SETTING_SCROLL_WRAP_CLASS} w-full min-w-0`}>
        <div ref={scrollRef} className={INGAME_SETTING_SCROLL_CLASS}>
          <SettingTabPanel
            activeTab={activeTab}
            onOpenKickPlayer={onOpenKickPlayer}
            onOpenRoomCode={onOpenRoomCode}
            volumes={volumes}
            onVolumeChange={setVolume}
            sfxMuted={sfxMuted}
            onSfxMutedChange={setSfxMuted}
          />
        </div>

        <Scrollbar scrollRef={scrollRef} />
      </div>
    </div>
  )
}
