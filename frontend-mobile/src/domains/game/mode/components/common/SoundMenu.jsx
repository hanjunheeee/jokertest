// 위 줄 오른쪽 배경음 조절: 아이콘을 누르면 아래로 음소거·볼륨 막대 창이 열림
// 모드 선택·방 목록 페이지가 씀, 값·동작은 데스크톱 useAudioControl 그대로 (폰 폭엔 막대를 늘 펼칠 자리가 없음)
import { useState } from "react"
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { getSliderKnotLeftPercent } from "@/shared/constants/soundControlLayout.js"
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 소리 아이콘 + 펼침 창
export default function SoundMenu() {
  const [open, setOpen] = useState(false)
  const { sliderValue, isSilent, disabled, onVolumeChange, toggleMute } = useAudioControl(getGlobalBgmRef())

  const icon = isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="사운드 조절"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90"
      >
        <PublicAsset src={icon} alt="" className="block h-auto w-[2.4rem] select-none" />
      </button>

      {open ? (
        <>
          {/* 바깥 누르면 닫힘 */}
          <button type="button" aria-label="사운드 조절 닫기" className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-12 z-50 flex w-[min(16rem,80vw)] items-center gap-2 rounded-md border border-[#c4a87a]/60 bg-[#120c08]/95 p-2 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            role="group"
            aria-label="사운드 조절"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={toggleMute}
              aria-label={disabled ? "배경음 사용 안 함" : isSilent ? "음소거 해제" : "음소거"}
              aria-pressed={isSilent}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PublicAsset src={icon} alt="" className="block h-auto w-[2.4rem] select-none" />
            </button>

            <div className="relative h-11 min-w-0 flex-1">
              <PublicAsset
                src={SOUND_CONTROL_ASSETS.sliderBar}
                alt=""
                className="absolute inset-x-0 top-1/2 block h-auto w-full -translate-y-1/2 select-none"
              />
              {/* 투명 range가 조작을 받고, 손잡이 그림은 값 위치로 옮김 */}
              <input
                type="range"
                disabled={disabled}
                min={0}
                max={1}
                step={0.05}
                value={sliderValue}
                onChange={(event) => onVolumeChange(Number(event.target.value))}
                aria-label="배경음 볼륨"
                className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
              />
              <span
                className="pointer-events-none absolute top-1/2 z-10 w-4 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${getSliderKnotLeftPercent(sliderValue)}%` }}
                aria-hidden="true"
              >
                <PublicAsset src={SOUND_CONTROL_ASSETS.sliderKnot} alt="" className="block h-auto w-full select-none" />
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
