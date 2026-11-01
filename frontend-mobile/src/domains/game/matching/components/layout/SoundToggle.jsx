// 배경음 음소거 버튼 (데스크톱 SoundControl의 아이콘 부분만, 폰은 기기 음량 버튼이 있어 막대는 뺌)
// MatchingTopBar가 씀, 값·동작은 데스크톱 useAudioControl 그대로
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import { ICON_BTN_CLASS } from "../../constants/matchingMobileStyles.js"

// 음소거 켜고 끄기
export default function SoundToggle() {
  const { isSilent, disabled, toggleMute } = useAudioControl(getGlobalBgmRef())
  const label = disabled ? "배경음 사용 안 함" : isSilent ? "음소거 해제" : "음소거"

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggleMute}
      aria-label={label}
      aria-pressed={isSilent}
      title={disabled ? label : undefined}
      className={ICON_BTN_CLASS}
    >
      <PublicAsset
        src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
        alt=""
        className="block h-9 w-9 select-none object-contain"
      />
    </button>
  )
}
