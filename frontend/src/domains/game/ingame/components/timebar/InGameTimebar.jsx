import {
  INGAME_DAY_TIMEBAR_ACTIVE_PHASE,
  INGAME_DAY_TIMEBAR_PHASES,
  INGAME_TIMEBAR_ASSETS,
  INGAME_TIMEBAR_PREVIEW_DAY,
} from "../../constants/ingameTimebarAssets.js"
import {
  INGAME_TIMEBAR_ARROW_SIZE_CLASS,
  INGAME_TIMEBAR_DAY_LABEL_CLASS,
  INGAME_TIMEBAR_DAY_LABEL_INSET,
  INGAME_TIMEBAR_NODE_ACTIVE_CLASS,
  INGAME_TIMEBAR_NODE_GAP_CLASS,
  INGAME_TIMEBAR_NODE_SIZE_CLASS,
  INGAME_TIMEBAR_POSITION_CLASS,
  INGAME_TIMEBAR_TRACK_INSET,
} from "../../constants/ingameTimebarLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

function TimebarNode({ src, active }) {
  return (
    <div className="relative flex shrink-0 items-center justify-center">
      {active ? (
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.indicatorArrow}
          alt=""
          aria-hidden="true"
          className={INGAME_TIMEBAR_ARROW_SIZE_CLASS}
        />
      ) : null}
      <PublicAsset
        src={src}
        alt=""
        aria-hidden="true"
        className={`${INGAME_TIMEBAR_NODE_SIZE_CLASS}${
          active ? ` ${INGAME_TIMEBAR_NODE_ACTIVE_CLASS}` : ""
        }`}
      />
    </div>
  )
}

/**
 * 인게임 우측 상단 시간흐름 바 (낮 상태 prototype)
 * 좌측 일차·단계 노드·지시화살표 — 단계명 텍스트는 추후
 */
export default function InGameTimebar({
  day = INGAME_TIMEBAR_PREVIEW_DAY,
  activePhaseId = INGAME_DAY_TIMEBAR_ACTIVE_PHASE,
  className = INGAME_TIMEBAR_POSITION_CLASS,
}) {
  const dayLabel = `제 ${day}일`

  return (
    <div className={className} aria-label={`${dayLabel} 시간 흐름`}>
      <div className="relative w-full leading-none">
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.frame}
          alt=""
          className="block h-auto w-full select-none"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute flex items-center justify-center"
          style={INGAME_TIMEBAR_DAY_LABEL_INSET}
        >
          <span className={INGAME_TIMEBAR_DAY_LABEL_CLASS}>{dayLabel}</span>
        </div>

        <div
          className={`absolute flex items-center justify-between ${INGAME_TIMEBAR_NODE_GAP_CLASS}`}
          style={INGAME_TIMEBAR_TRACK_INSET}
          aria-hidden="true"
        >
          {INGAME_DAY_TIMEBAR_PHASES.map((phase) => (
            <TimebarNode
              key={phase.id}
              src={phase.src}
              active={phase.id === activePhaseId}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
