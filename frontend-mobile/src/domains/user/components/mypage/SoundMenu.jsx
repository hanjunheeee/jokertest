// 위 줄 소리 아이콘 + 눌러서 펼치는 배경음 조절 (데스크톱 오른쪽 아래 소리 조절 자리)
// TopBar가 씀

import { useState } from "react"
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import SoundSlider from "./SoundSlider.jsx"

// 아이콘은 지금 소리 상태를 보여 주고, 누르면 조절 칸을 엶
export default function SoundMenu() {
    const control = useAudioControl(getGlobalBgmRef())
    const [open, setOpen] = useState(false)

    const icon = control.isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon

    return (
        <div className="relative shrink-0">
            <button
                type="button"
                aria-label="사운드 조절 열기"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90"
            >
                <PublicAsset src={icon} alt="" className="block h-full w-full select-none object-contain" />
            </button>

            {open ? (
                <>
                    {/* 바깥을 누르면 닫힘 */}
                    <button
                        type="button"
                        aria-label="사운드 조절 닫기"
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-40 cursor-default border-0 bg-transparent"
                    />
                    <div className="absolute right-0 top-12 z-50 rounded-lg border border-[#c9b892]/50 bg-black/85 p-2 shadow-lg">
                        <SoundSlider control={control} />
                    </div>
                </>
            ) : null}
        </div>
    )
}
