// 인게임 설정 시트: 탭 줄(채팅·사운드·방관리)·고른 탭 본문·방 코드 보기 버튼, 위에 추방·방 코드 창
// InGamePage 위 줄이 { open, onClose }로 엶, 탭·소리 값은 데스크톱 useInGameSettingPanel (SettingPanel과 같은 구성)
import { useState } from "react"
import { INGAME_SETTING_ASSETS } from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingAssets.js"
import { useInGameSettingIsHost } from "@/domains/game/ingame/hooks/useInGameSettingIsHost.js"
import { useInGameSettingPanel } from "@/domains/game/ingame/hooks/useInGameSettingPanel.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import Sheet from "./frame/Sheet.jsx"
import KickSheet from "./kick/KickSheet.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { SHEET_BUTTON_LOOK } from "./parts/buttonLook.js"
import RoomCodeSheet from "./roomCode/RoomCodeSheet.jsx"
import SettingsBody from "./settings/SettingsBody.jsx"
import Tabs from "./settings/Tabs.jsx"

// 설정 시트가 추방 시트·방 코드 시트 여닫기를 들고 있음, 방장일 때만 방관리 탭
export default function SettingsSheet({ open, onClose }) {
  const [kickOpen, setKickOpen] = useState(false)
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)
  const roomCode = useInGameStore((s) => s.state?.roomCode ?? null)
  const isHost = useInGameSettingIsHost()
  const { activeTab, setActiveTab, visibleTabs, volumes, setVolume, sfxMuted, setSfxMuted } =
    useInGameSettingPanel({ isHost })

  // 설정 시트가 닫히면 위 시트 둘도 닫음 (다시 열 때 남아 있지 않게, 그리는 중에 바로 맞춤)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) {
      setKickOpen(false)
      setRoomCodeOpen(false)
    }
  }

  // 방 코드 버튼은 탭과 상관없이 바닥 줄에 고정 (데스크톱 창 아래 버튼 자리)
  const footer = (
    <div className="flex justify-end">
      <ImageButton
        look={SHEET_BUTTON_LOOK}
        label="방 코드 보기"
        src={INGAME_SETTING_ASSETS.roomCodeButton}
        onClick={() => setRoomCodeOpen(true)}
        className="h-11 w-[9.5rem]"
        labelClassName="text-[#ebe2cc]/90"
        data-testid="setting-room-code"
      />
    </div>
  )

  // 닫힌 첫 그림에서도 위 시트가 안 보이게 open을 같이 봄
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="설정"
        ariaLabel="인게임 설정"
        subtitle="게임 중 빠르게 변경할 수 있는 설정입니다."
        closeLabel="인게임 설정 닫기"
        header={<Tabs tabs={visibleTabs} activeTab={activeTab} onSelect={setActiveTab} />}
        footer={footer}
        testId="settings-sheet"
        escape={!kickOpen && !roomCodeOpen}
      >
        <SettingsBody
          activeTab={activeTab}
          onOpenKickPlayer={() => setKickOpen(true)}
          volumes={volumes}
          onVolumeChange={setVolume}
          sfxMuted={sfxMuted}
          onSfxMutedChange={setSfxMuted}
        />
      </Sheet>

      <KickSheet open={open && kickOpen} onClose={() => setKickOpen(false)} />
      <RoomCodeSheet open={open && roomCodeOpen} onClose={() => setRoomCodeOpen(false)} roomCode={roomCode} />
    </>
  )
}
