// 단계 행동 줄: 낮 토론 때 투표 시작 준비 글자 버튼 하나
// 시간 흐름 바(InGameTimebar)가 사용, 상태·동작은 조작 컨텍스트에서 꺼냄 (판정은 표가 다 차면 서버가 5초 뒤 스스로 함)
import { useContext } from "react"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import {
  DAY_VOTE_READY_DONE_LABEL,
  DAY_VOTE_READY_LABEL,
  DAY_VOTE_READY_SENDING_LABEL,
  BTN_CLASS,
  BTN_ROW_CLASS,
} from "../../constants/actions/ingameActionPanel.js"
import { INGAME_PHASE_ACTIONS, PHASE_ACTION_ATTR } from "../../constants/timebar/ingamePhaseActions.js"

// 버튼 줄 모양 (오른쪽 정렬)
const PHASE_ACTION_ROW_CLASS = `justify-end ${BTN_ROW_CLASS}`

// 상태별 버튼 글자, 표에 없으면 기본 글자
const DAY_READY_LABELS = new Map([["sending", DAY_VOTE_READY_SENDING_LABEL], ["ready", DAY_VOTE_READY_DONE_LABEL]])

// 지금 단계에 맞는 버튼 목록 (낮 토론일 때만 준비 버튼, 죽은 사람은 준비할 일이 없어 안 그림)
function buildPhaseActions(ctx) {
  const phase = ctx.gameState?.phase ?? null
  if (phase !== "DAY" || ctx.dayPhase !== "DAY_DISCUSSION") return []
  if (ctx.selfAliveForControls === false) return []
  return [{
    action: INGAME_PHASE_ACTIONS.DAY_READY,
    label: DAY_READY_LABELS.get(ctx.dayReadyStatus) ?? DAY_VOTE_READY_LABEL,
    enabled: Boolean(ctx.dayReadyControlsEnabled),
    onClick: ctx.submitDayReady,
  }]
}

// 조작 Provider 밖이거나 보일 버튼 없으면 안 그림
export default function InGamePhaseActionRow() {
  const ctx = useContext(InGameActionContext)
  if (!ctx) return null

  const actions = buildPhaseActions(ctx)
  if (actions.length === 0) return null

  return (
    <div className={PHASE_ACTION_ROW_CLASS} aria-label="단계 행동">
      {actions.map((entry) => (
        <button
          key={entry.action}
          type="button"
          {...{ [PHASE_ACTION_ATTR]: entry.action }}
          className={BTN_CLASS}
          disabled={!entry.enabled}
          onClick={entry.onClick}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}
