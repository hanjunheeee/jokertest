import { useEffect, useState } from "react"

const iconClass = "h-5 w-5 shrink-0"

function VolumeHighIcon() {
  return (
    <svg
      className={iconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  )
}

function VolumeLowIcon() {
  return (
    <svg
      className={iconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  )
}

function VolumeMuteIcon() {
  return (
    <svg
      className={iconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="m16 9 5 5" />
      <path d="m21 9-5 5" />
    </svg>
  )
}

function VolumeIcon({ muted, volume }) {
  if (muted || volume === 0) return <VolumeMuteIcon />
  if (volume < 0.5) return <VolumeLowIcon />
  return <VolumeHighIcon />
}

export default function SoundControl({ videoRef }) {
  const [volume, setVolume] = useState(0.6)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
  }, [videoRef, volume, muted])

  const toggleMute = () => {
    setMuted((prev) => {
      if (prev && volume === 0) setVolume(0.6)
      return !prev
    })
  }

  const onVolumeChange = (event) => {
    const next = Number(event.target.value)
    setVolume(next)
    setMuted(next === 0)
  }

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-white/20 bg-black/55 px-3 py-2 text-white shadow-lg backdrop-blur-sm"
      role="group"
      aria-label="사운드 조절"
    >
      <button
        type="button"
        onClick={toggleMute}
        className="flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-white/90 transition-colors hover:text-white"
        aria-label={muted ? "음소거 해제" : "음소거"}
        aria-pressed={muted}
      >
        <VolumeIcon muted={muted} volume={volume} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={onVolumeChange}
        className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/25 accent-amber-500 sm:w-28 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400"
        aria-label="배경음 볼륨"
      />
    </div>
  )
}

