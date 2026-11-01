// 설정 스토어의 상태 모양과 바꾸기 액션 (음량·음소거·일반·채팅·인게임 탭·초기화)
// settingsStore.js가 create 안에서 펼쳐 씀
import { GENERAL_SETTING_TEXT_SIZE } from "../../constants/generalSettings.js"
import { SFX_MUTED_DEFAULT } from "../../constants/settingsStorage.js"
import { defaultGeneralChecks, defaultVolumes } from "../../utils/settingsDefaults.js"

export const settingsState = (set) => ({
  volumes: defaultVolumes(),
  setVolume: (id, next) =>
    set((s) => ({ volumes: { ...s.volumes, [id]: next } })),

  // boolean이 아닌 값은 무시함
  sfxMuted: SFX_MUTED_DEFAULT,
  setSfxMuted: (next) =>
    set((s) => (typeof next === "boolean" ? { sfxMuted: next } : s)),
  toggleSfxMuted: () => set((s) => ({ sfxMuted: !s.sfxMuted })),

  inGameSettingTab: null,
  setInGameSettingTab: (tabId) => set({ inGameSettingTab: tabId }),

  generalChecks: defaultGeneralChecks(),
  setGeneralCheck: (id, next) =>
    set((s) => ({ generalChecks: { ...s.generalChecks, [id]: next } })),

  generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue,
  setGeneralTextSize: (next) => set({ generalTextSize: next }),

  // 채팅 값은 처음엔 null, 인게임 설정이 기본값을 채움
  chatChecks: null,
  setChatCheck: (id, next) =>
    set((s) => ({ chatChecks: { ...(s.chatChecks ?? {}), [id]: next } })),

  chatTextSize: null,
  setChatTextSize: (next) => set({ chatTextSize: next }),

  // 인게임 탭은 저장 대상이 아니라 초기화에서 건드리지 않음
  resetSettings: () =>
    set({
      volumes: defaultVolumes(),
      generalChecks: defaultGeneralChecks(),
      generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue,
      chatChecks: null,
      chatTextSize: null,
      sfxMuted: SFX_MUTED_DEFAULT,
    }),
})
