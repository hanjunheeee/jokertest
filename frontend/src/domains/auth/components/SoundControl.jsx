import { useEffect, useState } from "react"
import { SOUND_CONTROL_ASSETS } from "../constants/soundControlAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/**
 * prototype 사운드 조절 UI 프로토타입.png
 * - 원형 아이콘 높이 ≈ 슬라이더 바 높이의 1.2배
 * - 슬라이더 바 너비 ≈ 아이콘 지름의 3.8배
 * - 아이콘이 바 왼쪽에 겹침
 */
const ICON_SIZE_CLASS = "w-[clamp(2.85rem,3.9vw,3.5rem)]"
const BAR_WIDTH_CLASS = "w-[clamp(10.75rem,14.8vw,13.5rem)]"
const ICON_OVERLAP_CLASS = "-mr-[16%]"
const BAR_OFFSET_CLASS = "translate-x-[clamp(0.35rem,1.1vw,0.55rem)]"
const KNOT_INSET_PERCENT = { start: 20, end: 8 }

const SLIDER_BAR_CLASS = "block h-auto w-full select-none"
const SLIDER_KNOT_CLASS =
  "pointer-events-none absolute top-1/2 z-10 h-auto w-[24%] max-w-[1.15rem] min-w-[0.9rem] -translate-x-1/2 -translate-y-1/2 select-none"

function knotLeftPercent(value) {
  const travel = 100 - KNOT_INSET_PERCENT.start - KNOT_INSET_PERCENT.end
  return KNOT_INSET_PERCENT.start + value * travel
}

export default function SoundControl({ audioRef }) {
  const [volume, setVolume] = useState(0.6)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const video = audioRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
  }, [audioRef, volume, muted])

  const sliderValue = muted ? 0 : volume
  const isSilent = muted || volume === 0
  const percent = Math.round(sliderValue * 100)
  const knotLeft = knotLeftPercent(sliderValue)

  const onVolumeChange = (next) => {
    setVolume(next)
    setMuted(next === 0)
  }

  const toggleMute = () => {
    setMuted((prev) => {
      if (prev && volume === 0) setVolume(0.6)
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
          className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
          aria-label="배경음 볼륨"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <PublicAsset
          src={SOUND_CONTROL_ASSETS.sliderKnot}
          alt=""
          className={SLIDER_KNOT_CLASS}
          style={{ left: `${knotLeft}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}
