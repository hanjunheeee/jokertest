// 전역 배경음 재생과 음량 입히기 (마스터 × 배경음, 화면 음소거 버튼 상태)
// useBgmRuntime·useAudioControl이 씀
import { useEffect } from "react"
import { MUSIC_PLAYBACK_ENABLED } from "../constants/bgmAssets.js"
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"

// 마스터 × 배경음, 값이 없으면 기본값 100·80
export function readBgmGain(state = useSettingsStore.getState()) {
    const clamp = (value, fallback) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback)
    const master = clamp(state?.volumes?.["master-volume"], 100)
    const bgm = clamp(state?.volumes?.["bgm-volume"], 80)
    return (master / 100) * (bgm / 100)
}

// 음소거 버튼 상태는 저장 안 하고 앱 안에서만 들고 있음
let globalBgmUiMuted = false
const globalBgmUiMutedListeners = new Set()

// useSyncExternalStore 읽기용
export function getGlobalBgmUiMuted() {
    return globalBgmUiMuted
}

// 바뀌면 알림 받기, 끄는 함수 돌려줌
export function subscribeGlobalBgmUiMuted(listener) {
    globalBgmUiMutedListeners.add(listener)
    return () => globalBgmUiMutedListeners.delete(listener)
}

// boolean만 받고 같은 값이면 안 알림
export function setGlobalBgmUiMuted(next) {
    if (typeof next !== "boolean" || globalBgmUiMuted === next) return
    globalBgmUiMuted = next
    for (const listener of globalBgmUiMutedListeners) listener()
}

// 꺼진 빌드·음소거·음량 0이면 muted로 둠
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

// 켜지면 바로 재생 시도, 막히면 첫 클릭 때 다시 시도
export function useBgmAutoplay(audioRef) {
    useEffect(() => {
        const media = audioRef.current
        // 배경음 끈 빌드면 멈추고 끝
        if (!MUSIC_PLAYBACK_ENABLED) {
            if (media) {
                media.muted = true
                media.volume = 0
                media.pause()
            }
            return undefined
        }

        if (media) applyGlobalBgmToMedia(media)
        // 설정·음소거가 바뀌면 다시 입힘
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

            // 이미 재생 중이면 그대로
            if (media.paused === false) return

            const result = media.play()
            if (result && typeof result.catch === "function") {
                // 자동 재생 거절은 무시 (클릭 때 다시 시도)
                result.catch(() => {
                })
            }
        }

        playBgm()

        // 브라우저는 사용자가 한 번 눌러야 소리 재생을 허락함
        window.addEventListener("click", playBgm, { once: true })

        return () => {
            window.removeEventListener("click", playBgm)
            unsubscribeSettings()
            unsubscribeUiMute()
        }
    }, [audioRef])
}
