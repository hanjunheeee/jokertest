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
// 이름 맞춤 글자 크기는 이름마다 달라 칸 값(--nameplate-fit-size)으로 넘김
const FIT_SIZE_CLASS = "!text-[length:var(--nameplate-fit-size)]"

// 이름 다 보이게 맞출 때 글자 크기 (카드 폭 기준 cqi): 글자 수만큼 줄여 띠 포함 이름판 폭 76% 안에 들게, 짧은 이름은 SIZE_CLASS와 같은 11cqi
// 글자 하나 폭은 한글 1em + 자간 0.025em로 넉넉히 셈, 띠 옆 여백 0.35em×2
// 예: 8자 → 8.54cqi (카드 117px면 약 10px), 4자 → 11cqi
const FIT_WIDTH_CQI = 76
const FIT_MAX_CQI = 11
function fitNameplateFontSize(nickname) {
    const length = Array.from(nickname).length
    const cqi = Math.min(FIT_MAX_CQI, FIT_WIDTH_CQI / (length * 1.025 + 0.7))
    return `clamp(0.5rem, ${Number(cqi.toFixed(2))}cqi, 1.05rem)`
}

// 이름 없으면 안 그림, fitName이면 줄임표 대신 글자를 줄여 이름 전부 보임 (재판 피고 카드: 가입 최대 8자가 잘리던 것)
export default function Nameplate({ nickname = "", theme = null, voteHighlight = false, fitName = false }) {
    const themeStyles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
    if (!nickname) return null
    // 이름 색에 맞는 띠 (밝은 색은 어두운 띠, 짙은 색은 밝은 띠, 데스크톱 이름판과 같음)
    const band = buildNameplateBand(themeStyles?.color)
    const plateStyle = buildInGamePlayerNameplateStyle(themeStyles)

    return (
        <p
            className={`${INGAME_PLAYER_NAMEPLATE_CLASS} ${INGAME_PLAYER_NAMEPLATE_BAND_PLATE_CLASS} ${fitName ? FIT_SIZE_CLASS : SIZE_CLASS}`}
            style={fitName ? { ...plateStyle, "--nameplate-fit-size": fitNameplateFontSize(nickname) } : plateStyle}
            data-nameplate-fit={fitName ? "" : undefined}
        >
            <span className={INGAME_PLAYER_NAMEPLATE_BAND_CLASS} style={band.style} data-ingame-nameplate-band={band.kind}>{nickname}</span>
        </p>
    )
}
