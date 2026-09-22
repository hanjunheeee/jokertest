import { useEffect } from "react"
import { MUSIC_PLAYBACK_ENABLED } from "../constants/bgmAssets.js"
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"

/** 설정의 Master × 배경음 볼륨(0~100 두 개) → audio.volume(0~1). 값이 없으면 기본 배율을 쓴다. */
export function readBgmGain(state = useSettingsStore.getState()) {
    const clamp = (value, fallback) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback)
    const master = clamp(state?.volumes?.["master-volume"], 100)
    const bgm = clamp(state?.volumes?.["bgm-volume"], 80)
    return (master / 100) * (bgm / 100)
}

function applyBgmGain(media, gain) {
    try {
        media.volume = gain
        media.muted = gain <= 0
    } catch {
        // 일부 매체 구현은 volume 대입이 던진다 — 재생 자체는 계속한다.
    }
}

// 페이지에서 사용할 배경음악 자동 재생 훅입니다.
//
// 2026-09-22(운영자 AUDIO-01 완화): 배경음은 설정의 **Master × 배경음** 볼륨을 따른다(둘 중 하나가 0이면
// 무음). 효과음 재생 경로(createSfxPlayer)와는 계속 분리돼 있다 — 효과음 음소거(sfxMuted)는 배경음에
// 영향을 주지 않고, 배경음 볼륨은 효과음 gain에 들어가지 않는다.
export function useBgmAutoplay(audioRef) {
    useEffect(() => {
        const media = audioRef.current
        // 재생 차단 중에는 클릭으로 재시도하는 이벤트도 등록하지 않는다.
        if (!MUSIC_PLAYBACK_ENABLED) {
            if (media) {
                media.muted = true
                media.volume = 0
                media.pause()
            }
            return undefined
        }

        if (media) applyBgmGain(media, readBgmGain())
        const unsubscribe = useSettingsStore.subscribe((state) => {
            const current = audioRef.current
            if (current) applyBgmGain(current, readBgmGain(state))
        })

        // 배경음악을 재생하는 함수입니다.
        const playBgm = () => {
            // 아직 audio 태그가 화면에 연결되지 않았다면 실행하지 않습니다.
            if (!audioRef.current) return

            // audio 태그의 play()를 호출해서 음악 재생을 시도합니다.
            const result = audioRef.current.play()
            if (result && typeof result.catch === "function") {
                result.catch(() => {
                    // 브라우저가 자동 재생을 막으면 여기로 들어옵니다 — 첫 클릭에서 다시 시도합니다.
                })
            }
        }

        // 페이지가 처음 뜰 때 바로 한 번 재생을 시도합니다.
        playBgm()

        // 첫 재생이 막혔을 수 있으니, 사용자가 화면을 처음 클릭했을 때 다시 한 번 재생합니다.
        // once: true라서 클릭 이벤트는 한 번 실행된 뒤 자동으로 제거됩니다.
        window.addEventListener("click", playBgm, { once: true })

        // 페이지를 벗어나면 남아 있는 클릭 이벤트와 설정 구독을 정리합니다.
        return () => {
            window.removeEventListener("click", playBgm)
            unsubscribe()
        }
    }, [audioRef])
}
