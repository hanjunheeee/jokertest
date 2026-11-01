// 배경음 조절 (음소거 아이콘 + 그림 막대), 데스크톱 오른쪽 아래 소리 조절과 같은 값
// pages/SettingPage.jsx가 바닥 줄(ShellBottom)에 씀
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import MuteButton from "@m/shared/ui/sound/MuteButton.jsx"
import RangeSlider from "./RangeSlider.jsx"

// 막대 그림 앞뒤 장식 (데스크톱 soundControlLayout과 같은 %)
const BAR_EDGE = { startPct: 20, endPct: 8 }

// 값·동작은 데스크톱 useAudioControl, 0~1 값을 0~100 칸으로 바꿔 씀
export default function BgmControl() {
    const control = useAudioControl(getGlobalBgmRef())
    const { sliderValue, disabled, onVolumeChange } = control
    const percent = Math.round(sliderValue * 100)

    return (
        // 막대 그림이 403×88이라 폭을 15rem으로 묶어야 바닥 줄 높이 안에 들어감
        <div className="flex w-full max-w-60 items-center gap-1" role="group" aria-label="사운드 조절">
            <MuteButton
                control={control}
                className="flex size-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-default"
                iconClassName="block w-11 h-auto select-none"
            />
            <RangeSlider
                value={percent}
                min={0}
                max={100}
                step={5}
                onChange={(next) => onVolumeChange(next / 100)}
                ariaLabel="배경음 볼륨"
                ariaValueText={`${percent}%`}
                disabled={disabled}
                trackSrc={SOUND_CONTROL_ASSETS.sliderBar}
                knobSrc={SOUND_CONTROL_ASSETS.sliderKnot}
                edge={BAR_EDGE}
                knobClassName="w-4"
                className="min-w-0 flex-1"
            />
        </div>
    )
}
