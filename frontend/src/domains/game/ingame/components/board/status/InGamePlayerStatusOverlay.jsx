import {
  BADGE_CLASS,
  OVERLAY_INSET,
  PORTRAIT_DIM_CLASS,
  STATUS_VISUALS,
  isStatusActive,
} from "../../../../shared/constants/ingamePlayerStatus.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function InGamePlayerStatusOverlay({ status }) {
  if (isStatusActive(status)) return null

  const visual = STATUS_VISUALS[status]
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
