// 배경음 음소거 그림 버튼 (켜짐·꺼짐 아이콘, 누르는 칸 44px 이상)
// SoundGroup·MuteToggle·설정 BgmControl이 씀
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 읽어 주는 글: 잠김 / 음소거 해제 / 음소거
function muteLabel(disabled, isSilent) {
  if (disabled) return "배경음 사용 안 함"
  if (isSilent) return "음소거 해제"
  return "음소거"
}

// control = 데스크톱 useAudioControl 결과, title이면 잠겼을 때 이유를 title로 보여 줌
export default function MuteButton({ control, className, iconClassName, title = false, style }) {
  const { isSilent, disabled, toggleMute } = control
  const label = muteLabel(disabled, isSilent)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggleMute}
      aria-label={label}
      aria-pressed={isSilent}
      title={title && disabled ? label : undefined}
      className={className}
      style={style}
    >
      <PublicAsset
        src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
        alt=""
        className={iconClassName}
      />
    </button>
  )
}
