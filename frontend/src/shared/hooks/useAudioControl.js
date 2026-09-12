import { useEffect, useState } from "react"
import { MUSIC_PLAYBACK_ENABLED } from "../constants/bgmAssets.js"

// audio 태그의 볼륨과 음소거 상태를 관리하는 커스텀 훅입니다.
//
// F-16(AC-03/AC-06): 이 훅은 **배경음(BGM) 전용**이며 settingsStore를 의도적으로 구독하지
// 않습니다. 효과음 설정(Master × 효과음 볼륨, 효과음 음소거)은 createSfxPlayer의
// getMix()/subscribeMix()만 읽고, 그 값은 이 경로로 절대 흘러들지 않습니다 — 그래서 어떤
// 사운드 설정 조작(볼륨 최대, 음소거 해제, 설정 초기화)으로도 금지된 BGM이 다시 켜지지
// 않습니다. 아래 MUSIC_PLAYBACK_ENABLED 분기가 그 잠금이며 F-16은 그것을 바꾸지 않습니다.
export function useAudioControl(audioRef) {
    // 실제 볼륨 값입니다. 0은 무음, 1은 최대 볼륨입니다.
    const [ volume, setVolume ] = useState(0.6)

    // 음소거 여부입니다. 처음에는 자동 재생 정책을 고려해 음소거 상태로 시작합니다.
    const [ muted, setMuted ] = useState(true)

    useEffect(() => {
        // 부모 컴포넌트에서 넘겨준 audio ref의 실제 DOM 요소입니다.
        const media = audioRef?.current

        // 아직 audio 요소가 연결되지 않았다면 아무 작업도 하지 않습니다.
        if(!media) return

        // React 상태값을 실제 audio 요소에 반영합니다.
        media.volume = MUSIC_PLAYBACK_ENABLED ? volume : 0
        media.muted = !MUSIC_PLAYBACK_ENABLED || muted
    }, [audioRef, volume, muted])

    // 볼륨 슬라이더 값이 바뀔 때 호출합니다.
    // 볼륨이 0이면 자동으로 음소거 상태로 봅니다.
    const onVolumeChange = (next) => {
        if (!MUSIC_PLAYBACK_ENABLED) return
        setVolume(next)
        setMuted(next === 0)
    }

    // 음소거 버튼을 눌렀을 때 호출합니다.
    const toggleMute = () => {
        if (!MUSIC_PLAYBACK_ENABLED) return
        setMuted((prev) => {
            // 음소거를 해제하려는데 볼륨이 0이면 들릴 수 있도록 기본 볼륨으로 복구합니다.
            if(prev && volume === 0) setVolume(0.6)
            return !prev
        })
    }

    // 음소거 상태일 때는 UI 슬라이더를 0으로 보여줍니다.
    const sliderValue = !MUSIC_PLAYBACK_ENABLED || muted ? 0 : volume

    // 아이콘이나 버튼 상태를 정할 때 쓰는 "현재 소리가 안 나는가?" 값입니다.
    const isSilent = !MUSIC_PLAYBACK_ENABLED || muted || volume === 0

    return {
        volume: MUSIC_PLAYBACK_ENABLED ? volume : 0,
        sliderValue,
        isSilent,
        disabled: !MUSIC_PLAYBACK_ENABLED,
        onVolumeChange,
        toggleMute,
    }
}
