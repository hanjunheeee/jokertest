/**
 * 우하단 사운드 조절 UI (prototype: 사운드 조절 UI 프로토타입.png)
 * LoginPage·로비·게임 페이지 등에서 BGM/배경 audio·video ref와 함께 사용
 *
 * props
 * - audioRef: HTMLAudioElement | HTMLVideoElement ref — volume·muted 동기화
 *
 * 아이콘 클릭 음소거 토글, 슬라이더로 볼륨 조절 (0이면 muted)
 * 에셋은 constants/soundControlAssets.js 참고
 */
import { useEffect, useState } from "react"
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const ICON_SIZE_CLASS = "w-[clamp(2.85rem,3.9vw,3.5rem)]"
const BAR_WIDTH_CLASS = "w-[clamp(10.75rem,14.8vw,13.5rem)]"
const ICON_OVERLAP_CLASS = "-mr-[16%]"
const BAR_OFFSET_CLASS = "translate-x-[clamp(0.35rem,1.1vw,0.55rem)]"
const KNOT_INSET_PERCENT = { start: 20, end: 8 }

const SLIDER_BAR_CLASS = "block h-auto w-full select-none"
const SLIDER_KNOT_WRAP_CLASS =
  "pointer-events-none absolute top-1/2 z-10 w-[24%] max-w-[1.15rem] min-w-[0.9rem] -translate-x-1/2 -translate-y-1/2"

const SLIDER_KNOT_IMG_CLASS = "block h-auto w-full select-none"

/** 슬라이더 값(0~1)을 노브 left %로 변환 */
function knotLeftPercent(value) {
  const travel = 100 - KNOT_INSET_PERCENT.start - KNOT_INSET_PERCENT.end
  return KNOT_INSET_PERCENT.start + value * travel
}

/** 음소거 아이콘 + 볼륨 슬라이더로 mediaRef 볼륨을 제어 */
export default function SoundControl({ audioRef }) {
  const [volume, setVolume] = useState(0.6)
  const [muted, setMuted] = useState(true) // 초기 음소거 — 자동재생 정책 대응

  // volume·muted 변경 시 연결된 audio/video에 반영
  useEffect(() => {
    const video = audioRef?.current
    if (!video) return
    video.volume = volume
    video.muted = muted
  }, [audioRef, volume, muted])

  const sliderValue = muted ? 0 : volume // UI 슬라이더는 음소거 시 0 위치
  const isSilent = muted || volume === 0
  const percent = Math.round(sliderValue * 100)
  const knotLeft = knotLeftPercent(sliderValue)

  const onVolumeChange = (next) => {
    setVolume(next)
    setMuted(next === 0) // 0으로 내리면 음소거
  }

  const toggleMute = () => {
    setMuted((prev) => {
      if (prev && volume === 0) setVolume(0.6) // 음소거 해제 시 볼륨 0이면 기본값 복구
      return !prev
    })
  }

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label="사운드 조절"
    >
      <button
        type="button"
        onClick={toggleMute}
        className={`relative z-10 shrink-0 ${ICON_SIZE_CLASS} ${ICON_OVERLAP_CLASS} cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90`}
        aria-label={isSilent ? "음소거 해제" : "음소거"}
        aria-pressed={isSilent}
      >
        <PublicAsset
          src={
            isSilent
              ? SOUND_CONTROL_ASSETS.noSoundIcon
              : SOUND_CONTROL_ASSETS.soundOnIcon
          }
          alt=""
          className="block h-auto w-full select-none"
        />
      </button>

      <div className={`relative shrink-0 ${BAR_WIDTH_CLASS} ${BAR_OFFSET_CLASS}`}>
        <PublicAsset
          src={SOUND_CONTROL_ASSETS.sliderBar}
          alt=""
          className={SLIDER_BAR_CLASS}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sliderValue}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          className="peer absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
          aria-label="배경음 볼륨"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <span
          className={SLIDER_KNOT_WRAP_CLASS}
          style={{ left: `${knotLeft}%` }}
          aria-hidden="true"
        >
          <span className="interactive-scale-peer-sm block w-full">
            <PublicAsset
              src={SOUND_CONTROL_ASSETS.sliderKnot}
              alt=""
              className={SLIDER_KNOT_IMG_CLASS}
            />
          </span>
        </span>
      </div>
    </div>
  )
}
