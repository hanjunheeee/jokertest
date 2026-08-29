import {
  INGAME_DAY_TIMEBAR_ACTIVE_PHASE,
  INGAME_DAY_TIMEBAR_PHASES,
  INGAME_TIMEBAR_ASSETS,
  INGAME_TIMEBAR_PREVIEW_DAY,
} from "../../constants/timebar/ingameTimebarAssets.js"
import {
  INGAME_TIMEBAR_ARROW_SIZE_CLASS,
  INGAME_TIMEBAR_DAY_LABEL_CLASS,
  INGAME_TIMEBAR_DAY_LABEL_INSET,
  INGAME_TIMEBAR_NODE_ACTIVE_CLASS,
  INGAME_TIMEBAR_NIGHT_TURN_CLASS,
  INGAME_TIMEBAR_NIGHT_TURN_COUNTDOWN_CLASS,
  INGAME_TIMEBAR_NODE_GAP_CLASS,
  INGAME_TIMEBAR_NODE_SIZE_CLASS,
  INGAME_TIMEBAR_POSITION_CLASS,
  INGAME_TIMEBAR_STACK_CLASS,
  INGAME_TIMEBAR_TRACK_INSET,
} from "../../constants/timebar/ingameTimebarLayout.js"
import { getInGameNightTurnRoleLabel } from "../../utils/getInGameNightTurnRoleLabel.js"
import InGameVoteToggleButton from "../vote/InGameVoteToggleButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 시간흐름 바 위 단계 노드 하나 — 활성 단계면 위에 지시 화살표를 추가로 그림 */
function TimebarNode({
  // src: 노드에 그릴 단계 아이콘 이미지 경로
  src,
  // active: 현재 진행 중인 단계인지 여부 — true면 강조 스타일 + 화살표 표시
  active,
}) {
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
  // day: 현재 게임 일차 — 좌측 "제 N일" 라벨에 표시
  day = INGAME_TIMEBAR_PREVIEW_DAY,
  // activePhaseId: 현재 활성화된 단계(낮/투표 등)의 id — 해당 노드만 강조 표시
  activePhaseId = INGAME_DAY_TIMEBAR_ACTIVE_PHASE,
  // nightTurnRole: 지금 진행 중인 밤 역할 턴(night_turn_started payload의 role) — 없으면 밤이
  // 아니거나 아직 어떤 턴도 방송되지 않았다는 뜻이라 이 줄 자체를 그리지 않는다.
  nightTurnRole = null,
  // nightTurnRemainingSec: 그 턴의 deadline까지 남은 초(0에서 멈춤). 역할만 있고 남은 시간이
  // 없는 경우(계산 불가)에도 역할 표기는 그대로 보여준다.
  nightTurnRemainingSec = null,
  // onVoteStatusClick: timebar 우측 하단 투표현황 버튼 클릭
  onVoteStatusClick,
  className = INGAME_TIMEBAR_POSITION_CLASS,
}) {
  const dayLabel = `제 ${day}일`
  // 모르는 역할이라도 서버가 지목한 턴이면 숨기지 않는다 — 표기만 원문으로 떨어진다.
  const nightTurnLabel = nightTurnRole ? (getInGameNightTurnRoleLabel(nightTurnRole) ?? nightTurnRole) : null

  return (
    <div
      className={`${className} ${INGAME_TIMEBAR_STACK_CLASS}`.trim()}
      aria-label={`${dayLabel} 시간 흐름`}
    >
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

      {nightTurnLabel ? (
        <p className={INGAME_TIMEBAR_NIGHT_TURN_CLASS} data-night-turn-role={nightTurnRole}>
          {nightTurnLabel}의 시간
          {Number.isFinite(nightTurnRemainingSec) ? (
            <span className={INGAME_TIMEBAR_NIGHT_TURN_COUNTDOWN_CLASS}>· {nightTurnRemainingSec}초</span>
          ) : null}
        </p>
      ) : null}

      {onVoteStatusClick ? (
        <InGameVoteToggleButton onClick={onVoteStatusClick} />
      ) : null}
    </div>
  )
}