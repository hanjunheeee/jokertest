// 단계 행동 줄: 낮 준비·낮 집계·재판 판정·밤 종료 글자 버튼
// 시간 흐름 바(InGameTimebar)가 사용, 상태·동작은 조작 컨텍스트에서 꺼냄
import { useContext } from "react"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import {
  DAY_VOTE_READY_DONE_LABEL,
  DAY_VOTE_READY_LABEL,
  DAY_VOTE_READY_SENDING_LABEL,
  BTN_CLASS,
  BTN_ROW_CLASS,
} from "../../constants/actions/ingameActionPanel.js"

// 버튼 줄 모양 (오른쪽 정렬)
const PHASE_ACTION_ROW_CLASS = `justify-end ${BTN_ROW_CLASS}`

// 단계 행동 표시 이름과 값들 (구석 패널 버튼도 같은 표시, 시험이 찾음)
export const PHASE_ACTION_ATTR = "data-ingame-phase-action"

export const INGAME_PHASE_ACTIONS = Object.freeze({
  DAY_READY: "dayReady",
  DAY_VOTE_ABSTAIN: "dayVoteAbstain",
  DAY_VOTE_RESOLVE: "dayVoteResolve",
  TRIBUNAL_RESOLVE: "tribunalResolve",
  NIGHT_SKIP: "nightSkip",
  NIGHT_RESOLVE: "nightResolve",
})

// 지금 단계에 맞는 버튼 목록, 글자는 보내는 중·끝남 따라 바뀜
function buildPhaseActions(ctx) {
  const phase = ctx.gameState?.phase ?? null
  const actions = []

  // 낮 토론: 준비 버튼
  if (phase === "DAY" && ctx.dayPhase === "DAY_DISCUSSION") {
    actions.push({
      action: INGAME_PHASE_ACTIONS.DAY_READY,
      label: ctx.dayReadyStatus === "sending"
        ? DAY_VOTE_READY_SENDING_LABEL
        : ctx.dayReadyStatus === "ready"
          ? DAY_VOTE_READY_DONE_LABEL
          : DAY_VOTE_READY_LABEL,
      enabled: Boolean(ctx.dayReadyControlsEnabled),
      onClick: ctx.submitDayReady,
    })
  }

  // 낮 투표: 집계 버튼
  if (phase === "DAY" && ctx.dayPhase === "DAY_VOTE") {
    actions.push({
      action: INGAME_PHASE_ACTIONS.DAY_VOTE_RESOLVE,
      label: ctx.dayVoteResolveStatus === "resolving"
        ? "집계 중..."
        : ctx.dayVoteResolveStatus === "resolved"
          ? "집계 완료"
          : "낮 집계",
      enabled: Boolean(ctx.dayVoteResolveControlsEnabled),
      onClick: ctx.resolveDayVote,
    })
  }

  // 재판: 판정 버튼 (끝났으면 판정 완료)
  if (phase === "TRIBUNAL") {
    actions.push({
      action: INGAME_PHASE_ACTIONS.TRIBUNAL_RESOLVE,
      label: ctx.gameState?.tribunal?.resolved === true
        ? "판정 완료"
        : ctx.tribunalResolveLocked
          ? "판정 중..."
          : "재판 판정",
      enabled: Boolean(ctx.tribunalResolveControlsEnabled),
      onClick: ctx.resolveTribunalVote,
    })
  }

  // 밤: 내 차례일 때만 밤 종료, 판정 요청 전에만 누름
  if (phase === "NIGHT" && ctx.isNightTurnActor) {
    actions.push({
      action: INGAME_PHASE_ACTIONS.NIGHT_RESOLVE,
      label: ctx.resolveNightStatus === "resolving"
        ? "판정 중..."
        : ctx.resolveNightStatus === "resolved"
          ? "판정 완료"
          : "밤 종료",
      enabled: ctx.resolveNightStatus === "idle",
      onClick: ctx.resolveNight,
    })
  }

  return actions
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
