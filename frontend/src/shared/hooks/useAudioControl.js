import { useEffect, useState } from "react"
import { MUSIC_PLAYBACK_ENABLED } from "../constants/bgmAssets.js"
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"
import { readBgmGain } from "./useBgmAutoplay.js"

// audio 태그의 볼륨과 음소거 상태를 관리하는 커스텀 훅입니다(로비·로그인 화면의 소리 조절기).
//
// 2026-09-22(운영자 AUDIO-01 완화): 배경음이 켜졌다. 조절기의 슬라이더는 설정의 **배경음** 볼륨
// (settingsStore volumes["bgm-volume"], 0~100)을 읽고 쓰며, 실제 audio 요소에는 Master × 배경음이
// 들어간다 — 설정 화면의 슬라이더와 같은 값을 움직인다. 음소거 버튼은 이 화면의 임시 상태다(설정을
// 바꾸지 않는다). 효과음 설정(효과음 볼륨·효과음 음소거)은 여기에 들어오지 않는다.
export function useAudioControl(audioRef) {
    const bgmPercent = useSettingsStore((s) => s.volumes?.["bgm-volume"])
    const masterPercent = useSettingsStore((s) => s.volumes?.["master-volume"])
    const setSettingsVolume = useSettingsStore((s) => s.setVolume)

    // 슬라이더가 보는 값(0~1) — 설정의 배경음 볼륨.
    const volume = MUSIC_PLAYBACK_ENABLED && Number.isFinite(bgmPercent) ? bgmPercent / 100 : 0

    // 음소거 여부입니다. 처음에는 자동 재생 정책을 고려해 음소거 상태로 시작하지 않는다 — 자동재생이
    // 거부되면 useBgmAutoplay가 첫 클릭에서 다시 시도한다.
    const [ muted, setMuted ] = useState(false)

    useEffect(() => {
        // 부모 컴포넌트에서 넘겨준 audio ref의 실제 DOM 요소입니다.
        const media = audioRef?.current

        // 아직 audio 요소가 연결되지 않았다면 아무 작업도 하지 않습니다.
        if(!media) return

        // 설정값(Master × 배경음)과 이 화면의 음소거를 실제 audio 요소에 반영합니다.
        const gain = MUSIC_PLAYBACK_ENABLED ? readBgmGain(useSettingsStore.getState()) : 0
        media.volume = gain
        media.muted = !MUSIC_PLAYBACK_ENABLED || muted || gain <= 0
    }, [audioRef, muted, bgmPercent, masterPercent])

    // 볼륨 슬라이더 값이 바뀔 때 호출합니다(0~1). 설정의 배경음 볼륨에 그대로 저장합니다.
    // 볼륨이 0이면 자동으로 음소거 상태로 봅니다.
    const onVolumeChange = (next) => {
        if (!MUSIC_PLAYBACK_ENABLED) return
        const percent = Math.round(Math.min(1, Math.max(0, next)) * 100)
        setSettingsVolume("bgm-volume", percent)
        setMuted(percent === 0)
    }

    // 음소거 버튼을 눌렀을 때 호출합니다.
    const toggleMute = () => {
        if (!MUSIC_PLAYBACK_ENABLED) return
        setMuted((prev) => {
            // 음소거를 해제하려는데 볼륨이 0이면 들릴 수 있도록 기본 볼륨으로 복구합니다.
            if (prev && volume === 0) setSettingsVolume("bgm-volume", 60)
            return !prev
        })
    }

    // 음소거 상태일 때는 UI 슬라이더를 0으로 보여줍니다.
    const sliderValue = !MUSIC_PLAYBACK_ENABLED || muted ? 0 : volume

    // 아이콘이나 버튼 상태를 정할 때 쓰는 "현재 소리가 안 나는가?" 값입니다.
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
