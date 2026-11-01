// 음량·효과음 끄기 값과 바꾸는 함수를 설정 스토어에서 꺼내 줌
// settings 소리 탭과 ingame 설정 창이 씀
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"

// 필요한 값만 골라 구독 (다른 설정이 바뀔 땐 다시 안 그림)
export function useSoundSettings() {
  const volumes = useSettingsStore((s) => s.volumes)
  const setVolume = useSettingsStore((s) => s.setVolume)
  const sfxMuted = useSettingsStore((s) => s.sfxMuted)
  const setSfxMuted = useSettingsStore((s) => s.setSfxMuted)

  return { volumes, setVolume, sfxMuted, setSfxMuted }
}
