// 플레이어 카드 위 상태 표시 (살아 있지 않을 때 초상 어둡게·상태 배지)
// InGamePlayerCard가 씀
import {
  BADGE_CLASS,
  OVERLAY_INSET,
  PORTRAIT_DIM_CLASS,
  STATUS_VISUALS,
  isStatusActive,
} from "../../../shared/constants/ingamePlayerStatus.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 생존이면 안 그림, 죽음·연결 끊김은 초상 어둡게 + 배지
export default function InGamePlayerStatusOverlay({ status }) {
  if (isStatusActive(status)) return null

  const visual = STATUS_VISUALS[status]
  // 모르는 상태 값이면 그릴 것 없음
  if (!visual?.portraitDim && !visual?.badgeSrc) return null

  return (
    <>
      {visual.portraitDim ? (
        <div
          className={PORTRAIT_DIM_CLASS}
          style={OVERLAY_INSET}
          aria-hidden="true"
        />
      ) : null}

      {visual.badgeSrc ? (
        <div
          className="pointer-events-none absolute z-[12] flex items-center justify-center overflow-hidden"
          style={OVERLAY_INSET}
          aria-hidden="true"
        >
          <PublicAsset
            src={visual.badgeSrc}
            alt=""
            className={visual.badgeClass ?? BADGE_CLASS}
          />
        </div>
      ) : null}
    </>
  )
}
