// 카드 초상 위 상태 표시 (죽음·연결 끊김이면 초상 어둡게 + 배지)
// PlayerCard가 씀 (상태별 그림·자리는 데스크톱 상수 그대로)
import {
    BADGE_CLASS,
    OVERLAY_INSET,
    PORTRAIT_DIM_CLASS,
    STATUS_VISUALS,
    isStatusActive,
} from "@/domains/game/shared/constants/ingamePlayerStatus.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 생존·모르는 상태면 안 그림
export default function StatusOverlay({ status }) {
    if (isStatusActive(status)) return null
    const visual = STATUS_VISUALS[status]
    if (!visual?.portraitDim && !visual?.badgeSrc) return null

    return (
        <>
            {visual.portraitDim ? (
                <div className={PORTRAIT_DIM_CLASS} style={OVERLAY_INSET} aria-hidden="true" />
            ) : null}
            {visual.badgeSrc ? (
                <div
                    className="pointer-events-none absolute z-[12] flex items-center justify-center overflow-hidden"
                    style={OVERLAY_INSET}
                    aria-hidden="true"
                >
                    <PublicAsset src={visual.badgeSrc} alt="" className={visual.badgeClass ?? BADGE_CLASS} />
                </div>
            ) : null}
        </>
    )
}
