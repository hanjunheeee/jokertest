// 배경음 조절 (음소거 아이콘 버튼 + 그림 슬라이더), 데스크톱 SoundControl의 모바일 크기판
// 로비 BottomBar가 씀 (다른 화면도 쓸 만해서 공용 후보)
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { getSliderKnotLeftPercent } from "@/shared/constants/soundControlLayout.js"
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 값·동작은 데스크톱 useAudioControl, 여기선 그림과 44px 누르는 칸만
export default function SoundControl() {
    const { sliderValue, isSilent, disabled, onVolumeChange, toggleMute } = useAudioControl(getGlobalBgmRef())
    const percent = Math.round(sliderValue * 100)
    const knotLeft = getSliderKnotLeftPercent(sliderValue)

    return (
        <div className="flex min-w-0 items-center" role="group" aria-label="사운드 조절">
            <button
                type="button"
                disabled={disabled}
                onClick={toggleMute}
                aria-label={disabled ? "배경음 사용 안 함" : isSilent ? "음소거 해제" : "음소거"}
                title={disabled ? "배경음 사용 안 함" : undefined}
                aria-pressed={isSilent}
                className="relative z-10 -mr-3 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-95 disabled:cursor-not-allowed md:h-14 md:w-14"
            >
                <PublicAsset
                    src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
                    alt=""
                    className="block h-auto w-full select-none"
                />
            </button>

            {/* 투명 range가 조작을 받고(높이 44px), 손잡이 그림은 값 위치로 옮김 */}
            <div className="relative flex h-11 w-[clamp(7.5rem,36vw,11rem)] min-w-0 items-center md:w-52">
                <PublicAsset src={SOUND_CONTROL_ASSETS.sliderBar} alt="" className="block h-auto w-full select-none" />
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
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 z-10 w-[12%] min-w-[0.9rem] max-w-[1.15rem] -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${knotLeft}%` }}
                >
                    <PublicAsset src={SOUND_CONTROL_ASSETS.sliderKnot} alt="" className="block h-auto w-full select-none" />
                </span>
            </div>
        </div>
    )
}
