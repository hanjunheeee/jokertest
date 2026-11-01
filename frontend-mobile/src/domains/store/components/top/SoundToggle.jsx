// 위 줄 배경음 켜고 끄기 아이콘 (데스크톱 오른쪽 아래 소리 조절 대신)
// top/StoreTopBar가 씀, 음량 막대는 환경설정 사운드 탭에 있음
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"

// 값·동작은 데스크톱 useAudioControl 그대로, 폰 폭엔 막대가 안 들어가서 아이콘만
export default function SoundToggle() {
    const { isSilent, disabled, toggleMute } = useAudioControl(getGlobalBgmRef())

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={toggleMute}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:opacity-50"
            aria-label={disabled ? "배경음 사용 안 함" : isSilent ? "음소거 해제" : "음소거"}
            aria-pressed={isSilent}
            style={{ outline: "none" }}
        >
            <PublicAsset
                src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
                alt=""
                className="block h-10 w-10 select-none object-contain"
            />
        </button>
    )
}
