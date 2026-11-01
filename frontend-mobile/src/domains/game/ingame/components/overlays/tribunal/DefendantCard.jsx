// 재판 피고 카드: 초상 + 카드 틀 + 이름판 (데스크톱 InGamePlayerCard와 같은 그림·자리 값)
// 재판 연출 창(TribunalOverlay)이 씀, 보드 카드는 보드 담당 몫이라 연출용으로 따로 둠
import PublicAsset from "@/shared/ui/PublicAsset"
import { getPortraitVariant } from "@/shared/constants/playerPortraitLayout.js"
import {
    FRAME_IMG_CLASS,
    FRAME_SHADOW_LAYER_CLASS,
    INGAME_PLAYER_ASSETS,
    INGAME_PLAYER_NAMEPLATE_CLASS,
} from "@/domains/game/ingame/constants/board/ingamePlayerAssets.js"
import {
    buildInGamePlayerNameplateStyle,
    resolveInGamePlayerCardThemeStyles,
} from "@/domains/game/ingame/utils/playerCardStyles.js"
import { resolveInGamePlayerFrameSrc } from "@/domains/game/ingame/utils/pickInGamePlayerFrame.js"

const PORTRAIT = getPortraitVariant("ingameCard")

// defendant = 플레이어 세션 목록의 한 사람 (portraitSrc·frameSrc·nickname·status·theme)
export default function DefendantCard({ defendant, className = "" }) {
    const frameSrc = resolveInGamePlayerFrameSrc(defendant.frameSrc ?? INGAME_PLAYER_ASSETS.cardFrame, defendant.status)
    const themeStyles = resolveInGamePlayerCardThemeStyles(defendant.theme)

    return (
        <div className={`relative [container-type:inline-size] ${className}`.trim()} data-tribunal-defendant={defendant.id}>
            <div className="absolute z-[1] overflow-hidden" style={PORTRAIT.portraitInset}>
                {defendant.portraitSrc ? (
                    <PublicAsset src={defendant.portraitSrc} alt="" className={PORTRAIT.portraitImageClass} />
                ) : null}
            </div>
            <div className="relative z-10 w-full">
                <PublicAsset src={frameSrc} alt="" className={FRAME_SHADOW_LAYER_CLASS} aria-hidden="true" />
                <PublicAsset src={frameSrc} alt="" className={FRAME_IMG_CLASS} />
            </div>
            {defendant.nickname ? (
                <p className={INGAME_PLAYER_NAMEPLATE_CLASS} style={buildInGamePlayerNameplateStyle(themeStyles)}>
                    <span className="block w-full truncate">{defendant.nickname}</span>
                </p>
            ) : null}
        </div>
    )
}
