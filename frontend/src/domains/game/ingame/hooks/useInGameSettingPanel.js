import { useEffect, useMemo } from "react"
import {
  INGAME_SETTING_DEFAULT_TAB,
  INGAME_SETTING_TABS,
} from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useSoundSettings } from "../../../../shared/hooks/useSoundSettings.js"
import { useSettingsStore } from "../../../settings/store/settingsStore.js"

export function useInGameSettingPanel({ isHost = false } = {}) {
  const storedTab = useSettingsStore((s) => s.inGameSettingTab)
  const setActiveTab = useSettingsStore((s) => s.setInGameSettingTab)
  const { volumes, setVolume, sfxMuted, setSfxMuted } = useSoundSettings()

  const activeTab = storedTab ?? INGAME_SETTING_DEFAULT_TAB

  const visibleTabs = useMemo(
    () => INGAME_SETTING_TABS.filter((tab) => !tab.hostOnly || isHost),
    [isHost],
  )

  useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === activeTab)) return
    setActiveTab(INGAME_SETTING_DEFAULT_TAB)
  }, [activeTab, visibleTabs, setActiveTab])

  return { activeTab, setActiveTab, visibleTabs, volumes, setVolume, sfxMuted, setSfxMuted }
}
