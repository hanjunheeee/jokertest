// 카드 아래 이름판 글자 (테마 글자색, 투표 강조면 진한 색, 글 뒤 띠)
// PlayerCard가 씀 (자리·글자 모양은 데스크톱 상수 그대로)
import {
    INGAME_PLAYER_NAMEPLATE_BAND_CLASS,
    INGAME_PLAYER_NAMEPLATE_BAND_PLATE_CLASS,
    INGAME_PLAYER_NAMEPLATE_CLASS,
} from "@/domains/game/ingame/constants/board/ingamePlayerAssets.js"
import {
    buildInGamePlayerNameplateStyle,
    resolveInGamePlayerCardThemeStyles,
} from "@/domains/game/ingame/utils/playerCardStyles.js"
import { buildNameplateBand } from "@/domains/game/ingame/utils/nameplateBand.js"

// 작은 카드에서도 읽히게 글자 하한만 낮춤 (데스크톱 하한 0.875rem은 5열 카드에 넘침)
const SIZE_CLASS = "!text-[clamp(0.62rem,11cqi,1.05rem)]"

// 이름 없으면 안 그림
export default function Nameplate({ nickname = "", theme = null, voteHighlight = false }) {
    const themeStyles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
    if (!nickname) return null
    // 이름 색에 맞는 띠 (밝은 색은 어두운 띠, 짙은 색은 밝은 띠, 데스크톱 이름판과 같음)
    const band = buildNameplateBand(themeStyles?.color)

    return (
        <p className={`${INGAME_PLAYER_NAMEPLATE_CLASS} ${INGAME_PLAYER_NAMEPLATE_BAND_PLATE_CLASS} ${SIZE_CLASS}`} style={buildInGamePlayerNameplateStyle(themeStyles)}>
            <span className={INGAME_PLAYER_NAMEPLATE_BAND_CLASS} style={band.style} data-ingame-nameplate-band={band.kind}>{nickname}</span>
        </p>
    )
}
