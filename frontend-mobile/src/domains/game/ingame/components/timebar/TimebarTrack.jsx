// 진행 바 틀 위 날짜 칸 + 단계 노드 길 (밤 → 결과 → 토론 → 투표)
// 진행 바(Timebar)가 씀, 자리 값은 데스크톱 진행 바 모양 상수 그대로
import { INGAME_DAY_TIMEBAR_PHASES } from "@/domains/game/ingame/constants/timebar/ingameTimebarAssets.js"
import {
  ARROW_SIZE_CLASS,
  DAY_LABEL_CLASS,
  DAY_LABEL_INSET,
  EXPANDED_ARROW_SIZE_CLASS,
  EXPANDED_DAY_LABEL_CLASS,
  EXPANDED_DAY_LABEL_INSET,
  EXPANDED_TRACK_INSET,
  NODE_GAP_CLASS,
  TRACK_INSET,
  TRACK_NODES_LAYER_CLASS,
} from "@/domains/game/ingame/constants/timebar/ingameTimebarLayout.js"
import TimebarNode from "./TimebarNode.jsx"

// 펼친 틀은 아래쪽이 타이머 자리라 날짜 칸·노드 길이 위로 올라감
export default function TimebarTrack({ dayLabel, activePhaseId, expanded }) {
  return (
    <>
      <div
        className="pointer-events-none absolute flex items-center justify-center"
        style={expanded ? EXPANDED_DAY_LABEL_INSET : DAY_LABEL_INSET}
      >
        <span className={expanded ? EXPANDED_DAY_LABEL_CLASS : DAY_LABEL_CLASS}>{dayLabel}</span>
      </div>

      <div
        className={`absolute flex items-center justify-between ${TRACK_NODES_LAYER_CLASS} ${NODE_GAP_CLASS}`}
        style={expanded ? EXPANDED_TRACK_INSET : TRACK_INSET}
        aria-hidden="true"
      >
        {INGAME_DAY_TIMEBAR_PHASES.map((phase) => (
          <TimebarNode
            key={phase.id}
            id={phase.id}
            src={phase.src}
            active={phase.id === activePhaseId}
            arrowSizeClass={expanded ? EXPANDED_ARROW_SIZE_CLASS : ARROW_SIZE_CLASS}
          />
        ))}
      </div>
    </>
  )
}
