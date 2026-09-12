import { useEffect, useMemo } from "react"
import {
  INGAME_SETTING_DEFAULT_TAB,
  INGAME_SETTING_TABS,
} from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useSoundSettings } from "../../../settings/hooks/useSoundSettings.js"
import { useSettingsStore } from "../../../settings/store/settingsStore.js"

/**
 * 인게임 설정 패널의 탭 전환 상태와 사운드 볼륨 값.
 *
 * 둘 다 이 훅이 소유하지 않고 설정 화면(UI-05)과 같은 store(settingsStore)에 둔다 —
 * 볼륨은 설정 화면과 인게임 패널이 같은 항목 정의(SOUND_SETTING_VOLUMES)와 같은 값을
 * 공유해야 하고, 탭은 패널이 닫혔다 열릴 때마다(SidePanel의 AnimatePresence가 본문을
 * 언마운트한다) 기본 탭으로 되돌아가지 않아야 하기 때문이다.
 *
 * 방관리 탭은 방장에게만 보이므로, 방장이 아니게 되어 현재 탭이 목록에서 사라지면 기본
 * 탭으로 되돌린다(사라진 탭이 선택된 채로 빈 본문이 남지 않게 한다).
 */
export function useInGameSettingPanel({ isHost = false } = {}) {
  // store는 "아직 고른 적 없음"(null)만 보관하고, 기본 탭이 무엇인지는 이 도메인이 정한다.
  const storedTab = useSettingsStore((s) => s.inGameSettingTab)
  const setActiveTab = useSettingsStore((s) => s.setInGameSettingTab)
  // F-16(AC-03): 효과음 음소거도 볼륨과 같은 훅·같은 store에서 가져온다 — 설정 화면에서
  // 바꾼 값이 인게임 패널에도 그대로 보이고, 그 반대도 같다(두 화면이 하나의 저장 키를 쓴다).
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
