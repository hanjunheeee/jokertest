import { useEffect } from "react"
import { MUSIC_PLAYBACK_ENABLED } from "../constants/bgmAssets.js"
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"

export function readBgmGain(state = useSettingsStore.getState()) {
    const clamp = (value, fallback) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback)
    const master = clamp(state?.volumes?.["master-volume"], 100)
    const bgm = clamp(state?.volumes?.["bgm-volume"], 80)
    return (master / 100) * (bgm / 100)
}

let globalBgmUiMuted = false
const globalBgmUiMutedListeners = new Set()

export function getGlobalBgmUiMuted() {
    return globalBgmUiMuted
}

export function subscribeGlobalBgmUiMuted(listener) {
    globalBgmUiMutedListeners.add(listener)
    return () => globalBgmUiMutedListeners.delete(listener)
}

export function setGlobalBgmUiMuted(next) {
    if (typeof next !== "boolean" || globalBgmUiMuted === next) return
    globalBgmUiMuted = next
    for (const listener of globalBgmUiMutedListeners) listener()
}

export function applyGlobalBgmToMedia(media, state = useSettingsStore.getState()) {
    if (!media) return

    try {
        const gain = readBgmGain(state)
        media.volume = gain
        media.muted = !MUSIC_PLAYBACK_ENABLED || globalBgmUiMuted || gain <= 0
    } catch {
        // 미디어 볼륨·음소거 반영 실패는 무시함
    }
}

export function useBgmAutoplay(audioRef) {
    useEffect(() => {
        const media = audioRef.current
        if (!MUSIC_PLAYBACK_ENABLED) {
            if (media) {
                media.muted = true
                media.volume = 0
                media.pause()
            }
            return undefined
        }

        if (media) applyGlobalBgmToMedia(media)
        const unsubscribeSettings = useSettingsStore.subscribe((state) => {
            const current = audioRef.current
            if (current) applyGlobalBgmToMedia(current, state)
        })
        const unsubscribeUiMute = subscribeGlobalBgmUiMuted(() => {
            const current = audioRef.current
            if (current) applyGlobalBgmToMedia(current)
        })

        const playBgm = () => {
            const media = audioRef.current
            if (!media) return

            if (media.paused === false) return

            const result = media.play()
            if (result && typeof result.catch === "function") {
                result.catch(() => {
                })
            }
        }

        playBgm()

        window.addEventListener("click", playBgm, { once: true })

        return () => {
            window.removeEventListener("click", playBgm)
            unsubscribeSettings()
            unsubscribeUiMute()
        }
    }, [audioRef])
}
