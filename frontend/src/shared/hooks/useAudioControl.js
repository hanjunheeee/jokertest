// 배경음 조절 값과 동작 (설정 스토어 배경음 크기 + 화면 음소거 상태)
// SoundControl이 씀
import { useEffect, useSyncExternalStore } from "react"
import { MUSIC_PLAYBACK_ENABLED } from "../constants/bgmAssets.js"
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"
import {
    applyGlobalBgmToMedia,
    getGlobalBgmUiMuted,
    setGlobalBgmUiMuted,
    subscribeGlobalBgmUiMuted,
} from "./useBgmAutoplay.js"

// 값이 바뀌면 전역 배경음 미디어에 바로 입힘
export function useAudioControl(audioRef) {
    const bgmPercent = useSettingsStore((s) => s.volumes?.["bgm-volume"])
    const masterPercent = useSettingsStore((s) => s.volumes?.["master-volume"])
    const setSettingsVolume = useSettingsStore((s) => s.setVolume)
    const muted = useSyncExternalStore(
        subscribeGlobalBgmUiMuted,
        getGlobalBgmUiMuted,
        getGlobalBgmUiMuted,
    )

    // 배경음 끈 빌드거나 값이 숫자가 아니면 0
    const volume = MUSIC_PLAYBACK_ENABLED && Number.isFinite(bgmPercent) ? bgmPercent / 100 : 0

    // 음소거·배경음·마스터 값이 바뀌면 다시 입힘
    useEffect(() => {
        applyGlobalBgmToMedia(audioRef?.current)
    }, [audioRef, muted, bgmPercent, masterPercent])

    // 0~1 값을 %로 저장, 0이면 음소거로 봄
    const onVolumeChange = (next) => {
        if (!MUSIC_PLAYBACK_ENABLED) return
        const percent = Math.round(Math.min(1, Math.max(0, next)) * 100)
        setSettingsVolume("bgm-volume", percent)
        setGlobalBgmUiMuted(percent === 0)
    }

    // 음소거를 풀 때 음량이 0이면 60%로 올려 소리가 나게 함
    const toggleMute = () => {
        if (!MUSIC_PLAYBACK_ENABLED) return
        const nextMuted = !getGlobalBgmUiMuted()
        if (!nextMuted && volume === 0) setSettingsVolume("bgm-volume", 60)
        setGlobalBgmUiMuted(nextMuted)
    }

    // 음소거 중엔 슬라이더를 0에 둠
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
