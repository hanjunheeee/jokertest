// 파일 역할: InGamePlayerStatusOverlay.jsx - 화면을 구성하는 컴포넌트입니다.
/**
 * 플레이어 카드 Status UI — alive면 렌더 없음, dead/disconnected dim + 배지
 */
import {
  INGAME_PLAYER_STATUS_BADGE_CLASS,
  INGAME_PLAYER_STATUS_OVERLAY_INSET,
  INGAME_PLAYER_STATUS_PORTRAIT_DIM_CLASS,
  INGAME_PLAYER_STATUS_VISUALS,
  isInGamePlayerStatusActive,
} from "../../../constants/board/status/ingamePlayerStatus.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function InGamePlayerStatusOverlay({ status }) {
  if (isInGamePlayerStatusActive(status)) return null

  const visual = INGAME_PLAYER_STATUS_VISUALS[status]
  if (!visual?.portraitDim && !visual?.badgeSrc) return null

  return (
    <>
      {visual.portraitDim ? (
        <div
          className={INGAME_PLAYER_STATUS_PORTRAIT_DIM_CLASS}
          style={INGAME_PLAYER_STATUS_OVERLAY_INSET}
          aria-hidden="true"
        />
      ) : null}

      {visual.badgeSrc ? (
        <div
          className="pointer-events-none absolute z-[12] flex items-center justify-center overflow-hidden"
          style={INGAME_PLAYER_STATUS_OVERLAY_INSET}
          aria-hidden="true"
        >
          <PublicAsset
            src={visual.badgeSrc}
            alt=""
            className={visual.badgeClass ?? INGAME_PLAYER_STATUS_BADGE_CLASS}
          />
        </div>
      ) : null}
    </>
  )
}
