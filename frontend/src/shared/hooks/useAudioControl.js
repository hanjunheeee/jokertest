import { useEffect, useState } from "react"

// audio 태그의 볼륨과 음소거 상태를 관리하는 커스텀 훅입니다.
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
        media.volume = volume
        media.muted = muted
    }, [audioRef, volume, muted])

    // 볼륨 슬라이더 값이 바뀔 때 호출합니다.
    // 볼륨이 0이면 자동으로 음소거 상태로 봅니다.
    const onVolumeChange = (next) => {
        setVolume(next)
        setMuted(next === 0)
    }

    // 음소거 버튼을 눌렀을 때 호출합니다.
    const toggleMute = () => {
        setMuted((prev) => {
            // 음소거를 해제하려는데 볼륨이 0이면 들릴 수 있도록 기본 볼륨으로 복구합니다.
            if(prev && volume === 0) setVolume(0.6)
            return !prev
        })
    }

    // 음소거 상태일 때는 UI 슬라이더를 0으로 보여줍니다.
    const sliderValue = muted ? 0: volume

    // 아이콘이나 버튼 상태를 정할 때 쓰는 "현재 소리가 안 나는가?" 값입니다.
    const isSilent = muted || volume === 0

    return { volume, sliderValue, isSilent, onVolumeChange, toggleMute}
}
