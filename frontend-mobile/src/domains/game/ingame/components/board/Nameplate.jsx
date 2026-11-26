// 카드 아래 이름판 글자 (테마 글자색 + 대비 띠, 투표 강조면 진한 색)
// PlayerCard가 씀, 재판 피고 카드는 fitName으로 8자 이름까지 말줄임 없이 맞춤
import {
    INGAME_PLAYER_NAMEPLATE_BAND_CLASS,
    INGAME_PLAYER_NAMEPLATE_BAND_PLATE_CLASS,
    INGAME_PLAYER_NAMEPLATE_CLASS,
} from "@/domains/game/ingame/constants/board/ingamePlayerAssets.js"
import { buildNameplateBand } from "@/domains/game/ingame/utils/nameplateBand.js"
import {
    buildInGamePlayerNameplateStyle,
    resolveInGamePlayerCardThemeStyles,
} from "@/domains/game/ingame/utils/playerCardStyles.js"

// 작은 카드에서도 읽히게 글자 하한만 낮춤 (데스크톱 하한 0.875rem은 5열 카드에 넘침)
const SIZE_CLASS = "!text-[clamp(0.62rem,11cqi,1.05rem)]"

// 긴 피고 이름(6~8자)이 이름판 폭을 넘지 않게 글자 크기 조절
function resolveFitFontSize(nickname, fitName) {
    const len = [...nickname].length
    if (!fitName || len <= 5) return null
    const cqi = (72 / (len + 0.8)).toFixed(2)
    return `clamp(0.62rem, ${cqi}cqi, 0.9rem)`
}

// 이름 없으면 안 그림
export default function Nameplate({ nickname = "", theme = null, voteHighlight = false, fitName = false }) {
    const themeStyles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
    if (!nickname) return null
    const band = buildNameplateBand(themeStyles?.color)
    const fitFontSize = resolveFitFontSize(nickname, fitName)
    const plateStyle = buildInGamePlayerNameplateStyle(themeStyles)

    return (
        <p
            className={`${INGAME_PLAYER_NAMEPLATE_CLASS} ${INGAME_PLAYER_NAMEPLATE_BAND_PLATE_CLASS} ${fitFontSize ? "" : SIZE_CLASS}`.trim()}
            style={fitFontSize ? { ...plateStyle, fontSize: fitFontSize } : plateStyle}
        >
            <span
                className={INGAME_PLAYER_NAMEPLATE_BAND_CLASS}
                style={band.style}
                data-ingame-nameplate-band={band.kind}
            >
                {nickname}
            </span>
        </p>
    )
}
