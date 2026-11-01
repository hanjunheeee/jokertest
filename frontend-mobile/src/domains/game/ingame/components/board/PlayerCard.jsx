// 플레이어 카드 그림: 초상·상태 표시·테마 테두리·카드 틀·이름판·"나" 표시
// CardSlot이 씀 (데스크톱 InGamePlayerCard를 화면 부품이라 못 불러 같은 상수로 다시 그림)
import {
    FRAME_IMG_CLASS,
    FRAME_SHADOW_LAYER_CLASS,
    INGAME_PLAYER_ASSETS,
} from "@/domains/game/ingame/constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "@/domains/game/shared/constants/ingamePlayerStatus.js"
import { buildPlayerCardE2eAttrs } from "@/domains/game/ingame/constants/ingameE2eHooks.js"
import { resolveInGamePlayerFrameSrc } from "@/domains/game/ingame/utils/pickInGamePlayerFrame.js"
import { resolveInGamePlayerCardThemeStyles } from "@/domains/game/ingame/utils/playerCardStyles.js"
import { getPortraitVariant } from "@/shared/constants/playerPortraitLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import FrameStroke from "./FrameStroke.jsx"
import Nameplate from "./Nameplate.jsx"
import StatusOverlay from "./StatusOverlay.jsx"

const SELF_BADGE_CLASS =
    "absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f3d28d] bg-[#3a1a0c] px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-[#ffe2ad] shadow-[0_2px_6px_rgba(0,0,0,0.5)]"

// 내 카드 금색 고리 (데스크톱 InGamePlayerCard와 같은 class)
const SELF_RING_CLASS = "ring-2 ring-[#f3d28d]/80 ring-offset-2 ring-offset-black/40 rounded-full"

// 틀 비율은 그림이 정함 (폭은 className으로)
export default function PlayerCard({
    portraitSrc,
    frameSrc = INGAME_PLAYER_ASSETS.cardFrame,
    nickname = "",
    status = INGAME_PLAYER_STATUS.ALIVE,
    theme = null,
    voteHighlight = false,
    isSelf = false,
    className = "",
}) {
    const styles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
    const displayFrameSrc = resolveInGamePlayerFrameSrc(frameSrc, status)
    const { portraitInset, portraitImageClass } = getPortraitVariant("ingameCard")

    return (
        <div
            className={`relative shrink-0 [container-type:inline-size] ${className}`}
            {...buildPlayerCardE2eAttrs({ nickname, status, isSelf })}
        >
            <div className={`relative w-full overflow-visible ${isSelf ? SELF_RING_CLASS : ""}`}>
                <div className="absolute z-[1] overflow-hidden" style={portraitInset}>
                    {portraitSrc ? <PublicAsset src={portraitSrc} alt="" className={portraitImageClass} /> : null}
                </div>
                <StatusOverlay status={status} />
                {isSelf ? <span className={SELF_BADGE_CLASS} aria-label="본인">나</span> : null}
                <div className="relative z-10 w-full overflow-visible">
                    {styles ? (
                        <FrameStroke frameSrc={displayFrameSrc} color={styles.color} scale={styles.frameStrokeScale} />
                    ) : null}
                    <PublicAsset src={displayFrameSrc} alt="" className={FRAME_SHADOW_LAYER_CLASS} aria-hidden="true" />
                    <PublicAsset src={displayFrameSrc} alt="" className={FRAME_IMG_CLASS} />
                </div>
                <Nameplate nickname={nickname} theme={theme} voteHighlight={voteHighlight} />
            </div>
        </div>
    )
}
