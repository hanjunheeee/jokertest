// 추방 대상 한 줄: 프로필·이름·추방 버튼 (고른 대상이면 "확인 중")
// KickSheet가 씀, 문구·그림·줄 판은 데스크톱 SettingKickPlayerRow와 같음
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { PLAYER_ASSETS } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import ProfilePortrait from "@m/shared/ui/portrait/ProfilePortrait.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { KICK_ROW_CLASS, ROW_BUTTON_LOOK } from "../../constants/voteFrameStyle.js"

// 대상 한 명 줄 (이름 색 없이 그림, 데스크톱 대기방 추방 창과 같음)
export default function KickRow({ name, profilePhotoSrc, profileBorderSrc, isPending, disabled, onKick }) {
  return (
    <li className={KICK_ROW_CLASS}>
      <ProfilePortrait photoSrc={profilePhotoSrc} frameSrc={profileBorderSrc} />
      <p className="min-w-0 flex-1 truncate font-subheading app-text-scaled [--app-text-size:1rem] font-bold leading-tight text-white">
        {name}
      </p>
      <ImageButton
        look={ROW_BUTTON_LOOK}
        label={isPending ? COPY.pendingLabel : COPY.kickActionLabel}
        ariaLabel={isPending ? COPY.pendingAriaLabel : COPY.kickActionLabel}
        src={PLAYER_ASSETS.kickActionButton}
        onClick={onKick}
        disabled={disabled}
      />
    </li>
  )
}
