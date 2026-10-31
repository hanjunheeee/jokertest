import { useSettingsStore } from "../store/settingsStore.js"

export function useSoundSettings() {
  const volumes = useSettingsStore((s) => s.volumes)
  const setVolume = useSettingsStore((s) => s.setVolume)
  const sfxMuted = useSettingsStore((s) => s.sfxMuted)
  const setSfxMuted = useSettingsStore((s) => s.setSfxMuted)

  return { volumes, setVolume, sfxMuted, setSfxMuted }
}
