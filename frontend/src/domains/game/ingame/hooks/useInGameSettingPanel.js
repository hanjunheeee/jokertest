// 설정 창 탭·소리 훅: 고른 탭 기억, 소리 설정 값
// 설정 창 내용(SettingPanelContent)·모바일 설정 시트가 사용, 고른 탭은 settings 스토어에 둠
import {
  INGAME_SETTING_DEFAULT_TAB,
  INGAME_SETTING_TABS,
} from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useSoundSettings } from "../../../../shared/hooks/useSoundSettings.js"
import { useSettingsStore } from "../../../settings/store/settingsStore.js"

// 보이는 탭·고른 탭·소리 값과 바꾸기 함수
export function useInGameSettingPanel() {
  const storedTab = useSettingsStore((s) => s.inGameSettingTab)
  const setActiveTab = useSettingsStore((s) => s.setInGameSettingTab)
  const { volumes, setVolume, sfxMuted, setSfxMuted } = useSoundSettings()

  const visibleTabs = INGAME_SETTING_TABS

  // 기억한 탭이 지금 없는 탭이면(없앤 방관리 탭을 골라 둔 채 저장된 경우) 기본 탭을 보여 줌
  const preferredTab = storedTab ?? INGAME_SETTING_DEFAULT_TAB
  const activeTab = visibleTabs.some((tab) => tab.id === preferredTab)
    ? preferredTab
    : INGAME_SETTING_DEFAULT_TAB

  return { activeTab, setActiveTab, visibleTabs, volumes, setVolume, sfxMuted, setSfxMuted }
}
