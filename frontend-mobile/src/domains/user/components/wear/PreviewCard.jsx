// 플레이어 카드 미리보기 (초상 + 흰 테두리 + 카드 틀 + 흰 닉네임 판)
// Preview가 씀
import {
  FRAME_IMG_CLASS,
  FRAME_SHADOW_LAYER_CLASS,
  INGAME_PLAYER_NAMEPLATE_CLASS,
} from "@/domains/game/ingame/constants/board/ingamePlayerAssets.js"
import { buildInGamePlayerNameplateStyle } from "@/domains/game/ingame/utils/playerCardStyles.js"
import {
  PREVIEW_AURA_FILTER,
  PREVIEW_NAMEPLATE_THEME,
  SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_TEXT_CLASS,
} from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import { getPortraitVariant } from "@/shared/constants/playerPortraitLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import FrameStroke from "@m/domains/user/components/wear/FrameStroke.jsx"

// 데스크톱 미리보기 테마(흰색): 틀 테두리·이름 글자색
const THEME = PREVIEW_NAMEPLATE_THEME.styles

const WRAP_CLASS = `relative w-full [container-type:inline-size] ${PREVIEW_AURA_FILTER} ${SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_TEXT_CLASS}`

// 데스크톱 InGamePlayerCard(theme=흰색)는 화면 부품이라 못 불러서 같은 상수로 다시 그림
export default function PreviewCard({ portraitSrc, frameSrc, nickname }) {
  const { portraitInset, portraitImageClass } = getPortraitVariant("ingameCard")

  return (
    <div className={WRAP_CLASS}>
      <div className="relative w-full overflow-visible">
        <div className="absolute z-[1] overflow-hidden" style={portraitInset}>
          {portraitSrc ? <PublicAsset src={portraitSrc} alt="" className={portraitImageClass} /> : null}
        </div>
        {frameSrc ? (
          <div className="relative z-10 w-full overflow-visible">
            <FrameStroke frameSrc={frameSrc} color={THEME.color} scale={THEME.frameStrokeScale} />
            <PublicAsset src={frameSrc} alt="" aria-hidden="true" className={FRAME_SHADOW_LAYER_CLASS} />
            <PublicAsset src={frameSrc} alt="" className={FRAME_IMG_CLASS} />
          </div>
        ) : null}
        {nickname ? (
          <p className={INGAME_PLAYER_NAMEPLATE_CLASS} style={buildInGamePlayerNameplateStyle(THEME)}>
            <span className="block w-full truncate">{nickname}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
