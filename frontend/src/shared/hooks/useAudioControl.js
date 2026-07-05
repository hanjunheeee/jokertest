import { useEffect, useState } from "react"

/**
 * 오디오/비디오 엘리먼트 볼륨·음소거 제어 훅.
 *
 * 이 훅은 <audio>/<video> 엘리먼트의 volume·muted 속성을 React state로 감싸서
 * 다루기 쉽게 캡슐화합니다. 반환값 { volume, sliderValue, isSilent, onVolumeChange, toggleMute }를
 * 그대로 볼륨 슬라이더 UI에 연결하면 됩니다.
 *
 * muted 초기값이 true인 이유:
 *   브라우저 자동재생 정책상 음소거 상태에서만 autoPlay가 허용됩니다.
 *   사용자가 직접 해제하거나 슬라이더를 올릴 때 소리가 나기 시작합니다.
 *
 * toggleMute에서 volume === 0 처리:
 *   볼륨을 0으로 내린 상태에서 음소거를 해제하면 소리가 여전히 0이라
 *   이해하기 어려운 상태가 됩니다. 기본값(0.6)으로 복구해 일관된 UX를 유지합니다.
 *
 * @param {React.RefObject<HTMLAudioElement|HTMLVideoElement>} audioRef - 볼륨을 제어할 대상 미디어 엘리먼트의 ref
 */
export function useAudioControl(audioRef) {
  // useState(초기값)은 [현재값, 값을 바꾸는 함수]를 반환하는 훅입니다.
  // setXxx를 호출해야 값이 바뀌고 컴포넌트가 다시 렌더링됩니다.
  const [volume, setVolume] = useState(0.6) // 마지막으로 설정한 볼륨 (음소거 해제 시 복구 기준)
  const [muted, setMuted] = useState(true) // 초기 음소거 — 자동재생 정책 대응

  // useEffect(콜백, 의존성배열)는 렌더링 이후 "부수효과"(DOM 조작, 구독 등)를 실행하는 훅입니다.
  // 의존성 배열에 담긴 값이 이전 렌더링과 달라졌을 때만 콜백이 다시 실행됩니다.
  // 여기서는 audioRef·volume·muted 중 하나라도 바뀌면 DOM 미디어 엘리먼트 속성을 다시 동기화합니다.
  useEffect(() => {
    const media = audioRef?.current
    if (!media) return
    // DOM media element 동기화는 외부 시스템 업데이트이므로 effect 내부에서 처리합니다.
    /* eslint-disable react-hooks/immutability */
    media.volume = volume
    media.muted = muted
    /* eslint-enable react-hooks/immutability */
  }, [audioRef, volume, muted])

  /** 슬라이더 값이 변경될 때 호출됩니다. 0으로 내리면 자동으로 음소거 상태가 됩니다. */
  const onVolumeChange = (next) => {
    setVolume(next)
    setMuted(next === 0) // 슬라이더를 0까지 내리면 음소거로 전환
  }

  /** 음소거를 토글합니다. 볼륨이 0인 상태에서 해제하면 기본 볼륨(0.6)을 복구합니다. */
  const toggleMute = () => {
    setMuted((prev) => {
      if (prev && volume === 0) setVolume(0.6) // 무음 상태에서 해제 → 볼륨 복구
      return !prev
    })
  }

  const sliderValue = muted ? 0 : volume // UI 슬라이더는 음소거 시 0 위치로 표시
  const isSilent = muted || volume === 0 // 아이콘 전환 기준 (음소거 or 볼륨 0)

  return { volume, sliderValue, isSilent, onVolumeChange, toggleMute }
}
