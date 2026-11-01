// 카드 아래 이름판 글자 (테마 글자색, 투표 강조면 진한 색)
// PlayerCard가 씀 (자리·글자 모양은 데스크톱 상수 그대로)
import { INGAME_PLAYER_NAMEPLATE_CLASS } from "@/domains/game/ingame/constants/board/ingamePlayerAssets.js"
import {
    buildInGamePlayerNameplateStyle,
    resolveInGamePlayerCardThemeStyles,
} from "@/domains/game/ingame/utils/playerCardStyles.js"

// 작은 카드에서도 읽히게 글자 하한만 낮춤 (데스크톱 하한 0.875rem은 5열 카드에 넘침)
const SIZE_CLASS = "!text-[clamp(0.62rem,11cqi,1.05rem)]"

// 이름 없으면 안 그림
export default function Nameplate({ nickname = "", theme = null, voteHighlight = false }) {
    const themeStyles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
    if (!nickname) return null

    return (
        <p className={`${INGAME_PLAYER_NAMEPLATE_CLASS} ${SIZE_CLASS}`} style={buildInGamePlayerNameplateStyle(themeStyles)}>
            <span className="block w-full truncate">{nickname}</span>
        </p>
    )
}
