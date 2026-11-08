// 설정 창 탭·소리 훅: 고른 탭 기억, 방장 아니면 방장 탭 숨기기, 소리 설정 값
// 설정 창 내용(SettingPanelContent)이 사용, 고른 탭은 settings 스토어에 둠
import { useMemo } from "react"
import {
  INGAME_SETTING_DEFAULT_TAB,
  INGAME_SETTING_TABS,
} from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useSoundSettings } from "../../../../shared/hooks/useSoundSettings.js"
import { useSettingsStore } from "../../../settings/store/settingsStore.js"

// 보이는 탭·고른 탭·소리 값과 바꾸기 함수
export function useInGameSettingPanel({ isHost = false } = {}) {
  const storedTab = useSettingsStore((s) => s.inGameSettingTab)
  const setActiveTab = useSettingsStore((s) => s.setInGameSettingTab)
  const { volumes, setVolume, sfxMuted, setSfxMuted } = useSoundSettings()

  const visibleTabs = useMemo(
    () => INGAME_SETTING_TABS.filter((tab) => !tab.hostOnly || isHost),
    [isHost],
  )

  // 고른 탭이 지금 안 보이면(방장 아님·방장 정보 아직 안 옴) 기본 탭을 보여 주기만 함
  // 기억한 탭은 안 덮음: 방장 정보가 늦게 와도 방장은 고른 탭으로 돌아감, 방장 아닌 사람에게 방장 탭이 한 번도 안 그려짐
  const preferredTab = storedTab ?? INGAME_SETTING_DEFAULT_TAB
  const activeTab = visibleTabs.some((tab) => tab.id === preferredTab)
    ? preferredTab
    : INGAME_SETTING_DEFAULT_TAB

  return { activeTab, setActiveTab, visibleTabs, volumes, setVolume, sfxMuted, setSfxMuted }
}
