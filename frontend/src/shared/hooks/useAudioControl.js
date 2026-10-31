import { useEffect, useSyncExternalStore } from "react"
import { MUSIC_PLAYBACK_ENABLED } from "../constants/bgmAssets.js"
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"
import {
    applyGlobalBgmToMedia,
    getGlobalBgmUiMuted,
    setGlobalBgmUiMuted,
    subscribeGlobalBgmUiMuted,
} from "./useBgmAutoplay.js"

export function useAudioControl(audioRef) {
    const bgmPercent = useSettingsStore((s) => s.volumes?.["bgm-volume"])
    const masterPercent = useSettingsStore((s) => s.volumes?.["master-volume"])
    const setSettingsVolume = useSettingsStore((s) => s.setVolume)
    const muted = useSyncExternalStore(
        subscribeGlobalBgmUiMuted,
        getGlobalBgmUiMuted,
        getGlobalBgmUiMuted,
    )

    const volume = MUSIC_PLAYBACK_ENABLED && Number.isFinite(bgmPercent) ? bgmPercent / 100 : 0

    useEffect(() => {
        applyGlobalBgmToMedia(audioRef?.current)
    }, [audioRef, muted, bgmPercent, masterPercent])

    const onVolumeChange = (next) => {
        if (!MUSIC_PLAYBACK_ENABLED) return
        const percent = Math.round(Math.min(1, Math.max(0, next)) * 100)
        setSettingsVolume("bgm-volume", percent)
        setGlobalBgmUiMuted(percent === 0)
    }

    const toggleMute = () => {
        if (!MUSIC_PLAYBACK_ENABLED) return
        const nextMuted = !getGlobalBgmUiMuted()
        if (!nextMuted && volume === 0) setSettingsVolume("bgm-volume", 60)
        setGlobalBgmUiMuted(nextMuted)
    }

    const sliderValue = !MUSIC_PLAYBACK_ENABLED || muted ? 0 : volume

    const isSilent = !MUSIC_PLAYBACK_ENABLED || muted || volume === 0

    return {
        volume,
        sliderValue,
        isSilent,
        disabled: !MUSIC_PLAYBACK_ENABLED,
        onVolumeChange,
        toggleMute,
    }
}
