// 추방 대상 한 줄: 프로필·이름·추방 버튼 (고른 대상이면 "확인 중")
// KickSheet가 씀, 문구·그림은 데스크톱 SettingKickPlayerRow와 같음
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { PLAYER_ASSETS } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import ProfilePortrait from "@m/shared/ui/portrait/ProfilePortrait.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { SHEET_ROW_CLASS } from "../../constants/matchingMobileStyles.js"

// 대상 한 명 줄
export default function KickRow({ name, profilePhotoSrc, profileBorderSrc, isPending, disabled, onKick }) {
  return (
    <li className={SHEET_ROW_CLASS}>
      <ProfilePortrait photoSrc={profilePhotoSrc} frameSrc={profileBorderSrc} />
      <p className="min-w-0 flex-1 truncate font-subheading app-text-scaled [--app-text-size:1rem] font-bold text-[#f5f0e6]">
        {name}
      </p>
      <ImageButton
        look="fill"
        label={isPending ? COPY.pendingLabel : COPY.kickActionLabel}
        ariaLabel={isPending ? COPY.pendingAriaLabel : COPY.kickActionLabel}
        src={PLAYER_ASSETS.kickActionButton}
        onClick={onKick}
        disabled={disabled}
        className="h-11 w-[5.5rem] shrink-0"
      />
    </li>
  )
}
