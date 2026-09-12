// 파일 역할: useSoundSettings.js - React 상태와 부수효과를 묶는 커스텀 훅입니다.
import { useSettingsStore } from "../store/settingsStore.js"

/**
 * 사운드 탭 볼륨·효과음 음소거 — 프론트 상태에만 보관하며 서버로 저장하지 않습니다.
 *
 * 값 자체는 이 훅이 소유하지 않고 settingsStore에 둡니다. 설정 화면과 인게임 설정 패널이
 * 같은 볼륨·음소거를 조작하므로, 훅 인스턴스마다 따로 상태를 들면 화면 사이에서 값이 갈라집니다.
 *
 * F-16(AC-03): sfxMuted는 **효과음에만** 적용됩니다. 배경음은 별도 정책(MUSIC_PLAYBACK_ENABLED)
 * 으로 차단되어 있고, 이 훅의 어떤 조작도 그것을 되돌리지 못합니다 — 사운드 탭의 "배경음"
 * 슬라이더 값은 효과음 gain 계산(Master × 효과음)에 들어가지 않습니다.
 */
export function useSoundSettings() {
  const volumes = useSettingsStore((s) => s.volumes)
  const setVolume = useSettingsStore((s) => s.setVolume)
  const sfxMuted = useSettingsStore((s) => s.sfxMuted)
  const setSfxMuted = useSettingsStore((s) => s.setSfxMuted)

  return { volumes, setVolume, sfxMuted, setSfxMuted }
}
