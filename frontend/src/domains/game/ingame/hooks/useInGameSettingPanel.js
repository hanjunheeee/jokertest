// 설정 창 탭·소리 훅: 고른 탭 기억, 방장 아니면 방장 탭 숨기기, 소리 설정 값
// 설정 창 내용(SettingPanelContent)이 사용, 고른 탭은 settings 스토어에 둠
import { useEffect, useMemo } from "react"
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

  const activeTab = storedTab ?? INGAME_SETTING_DEFAULT_TAB

  const visibleTabs = useMemo(
    () => INGAME_SETTING_TABS.filter((tab) => !tab.hostOnly || isHost),
    [isHost],
  )

  // 고른 탭이 안 보이게 되면(방장이 바뀜) 기본 탭으로
  useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === activeTab)) return
    setActiveTab(INGAME_SETTING_DEFAULT_TAB)
  }, [activeTab, visibleTabs, setActiveTab])

  return { activeTab, setActiveTab, visibleTabs, volumes, setVolume, sfxMuted, setSfxMuted }
}
