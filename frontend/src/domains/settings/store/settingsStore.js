// 파일 역할: settingsStore.js - 설정 화면과 인게임 설정 패널이 함께 쓰는 전역 상태 store입니다.
import { create } from "zustand"
import { SOUND_SETTING_VOLUMES } from "../constants/soundSettings.js"

function defaultVolumes() {
  return Object.fromEntries(
    SOUND_SETTING_VOLUMES.map(({ id, defaultValue }) => [id, defaultValue]),
  )
}

/**
 * 설정 값 store.
 *
 * 사운드 볼륨은 설정 화면(UI-05의 useSoundSettings)과 인게임 설정 패널
 * (useInGameSettingPanel) 두 곳에서 조작한다. 두 화면이 각자 useState를 들면 같은 항목이
 * 화면마다 다른 값을 갖게 되므로, 값은 이 store 한 곳에만 둔다 — 어느 쪽에서 슬라이더를
 * 움직여도 다른 쪽이 같은 값을 읽는다.
 *
 * 인게임 설정 패널의 탭도 여기에 둔다. 패널은 열고 닫힐 때마다 마운트/언마운트되는데
 * (SidePanel의 AnimatePresence), 탭이 컴포넌트 지역 상태면 그때마다 기본 탭으로 되돌아간다.
 *
 * 서버로 저장하지 않는 프론트 전용 값이다(새로고침하면 기본값으로 돌아간다).
 */
export const useSettingsStore = create((set) => ({
  volumes: defaultVolumes(),

  setVolume: (id, next) =>
    set((s) => ({ volumes: { ...s.volumes, [id]: next } })),

  // 인게임 설정 패널에서 마지막으로 고른 탭 id. null은 "아직 고른 적 없음"이고, 기본 탭이
  // 무엇인지는 인게임 도메인의 상수(INGAME_SETTING_DEFAULT_TAB)가 정한다 — 설정 도메인이
  // 인게임 도메인을 거꾸로 import하지 않기 위해 여기서는 값을 보관만 한다.
  inGameSettingTab: null,

  setInGameSettingTab: (tabId) => set({ inGameSettingTab: tabId }),
}))

/** 볼륨 초기값 — 테스트·초기화에서 store 기본 상태를 다시 만들 때 씁니다. */
export { defaultVolumes as buildDefaultSoundVolumes }
