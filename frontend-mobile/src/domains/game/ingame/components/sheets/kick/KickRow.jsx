// 추방 대상 한 줄: 프로필·이름·추방 버튼 (고른 대상이면 "확인 중")
// KickSheet가 씀, 문구·그림은 데스크톱 SettingKickPlayerRow와 같음
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { PLAYER_ASSETS } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import ImageButton from "../parts/ImageButton.jsx"
import Portrait from "../parts/Portrait.jsx"

// 대상 한 명 줄 (설정 추방 창은 이름 색 없이 그림, 데스크톱과 같음)
export default function KickRow({ name, profilePhotoSrc, profileBorderSrc, isPending, disabled, onKick }) {
  return (
    <li className="flex min-h-[3.75rem] min-w-0 items-center gap-3 border-b border-[#3a2818]/70 py-2 last:border-b-0">
      <Portrait photoSrc={profilePhotoSrc} frameSrc={profileBorderSrc} />
      <p className="min-w-0 flex-1 truncate font-subheading app-text-scaled [--app-text-size:1rem] font-bold text-white">
        {name}
      </p>
      <ImageButton
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
