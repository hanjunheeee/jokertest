// 배경음 조절 줄 (음소거 버튼 + 그림 슬라이더, 데스크톱 SoundControl 모양)
// SoundMenu가 씀

import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { getSliderKnotLeftPercent } from "@/shared/constants/soundControlLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 값·동작은 SoundMenu가 받은 useAudioControl 결과를 그대로 씀
export default function SoundSlider({ control }) {
    const { sliderValue, isSilent, disabled, onVolumeChange, toggleMute } = control
    const percent = Math.round(sliderValue * 100)

    return (
        <div className="flex items-center gap-1" role="group" aria-label="사운드 조절">
            <button
                type="button"
                disabled={disabled}
                onClick={toggleMute}
                aria-label={disabled ? "배경음 사용 안 함" : isSilent ? "음소거 해제" : "음소거"}
                aria-pressed={isSilent}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <PublicAsset
                    src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
                    alt=""
                    className="block h-full w-full select-none object-contain"
                />
            </button>

            <div className="relative flex h-11 w-44 shrink-0 items-center">
                <PublicAsset src={SOUND_CONTROL_ASSETS.sliderBar} alt="" className="block h-auto w-full select-none" />
                {/* 투명 range가 터치를 받고, 손잡이 그림은 값 위치로 옮김 */}
                <input
                    type="range"
                    disabled={disabled}
                    min={0}
                    max={1}
                    step={0.05}
                    value={sliderValue}
                    onChange={(event) => onVolumeChange(Number(event.target.value))}
                    aria-label="배경음 볼륨"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
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
    )
}
