import { useEffect, useMemo, useState } from "react"
import {
  INGAME_SETTING_DEFAULT_TAB,
  INGAME_SETTING_TABS,
} from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useSoundSettings } from "../../../settings/hooks/useSoundSettings.js"

/**
 * 인게임 설정 패널의 탭 전환 상태와 사운드 볼륨 값.
 *
 * 볼륨은 자체 state를 만들지 않고 설정 화면(UI-05)의 useSoundSettings를 그대로 쓴다 —
 * 인게임 설정과 설정 페이지가 같은 항목 정의(SOUND_SETTING_VOLUMES)와 같은 갱신 API를
 * 공유해야 두 화면의 값이 갈라지지 않는다.
 *
 * 방관리 탭은 방장에게만 보이므로, 방장이 아니게 되어 현재 탭이 목록에서 사라지면 기본
 * 탭으로 되돌린다(사라진 탭이 선택된 채로 빈 본문이 남지 않게 한다).
 */
export function useInGameSettingPanel({ isHost = false } = {}) {
  const [activeTab, setActiveTab] = useState(INGAME_SETTING_DEFAULT_TAB)
  const { volumes, setVolume } = useSoundSettings()

  const visibleTabs = useMemo(
    () => INGAME_SETTING_TABS.filter((tab) => !tab.hostOnly || isHost),
    [isHost],
  )

  useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === activeTab)) return
    setActiveTab(INGAME_SETTING_DEFAULT_TAB)
  }, [activeTab, visibleTabs])

  return { activeTab, setActiveTab, visibleTabs, volumes, setVolume }
}
