import { useContext } from "react"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import {
  DAY_VOTE_READY_DONE_LABEL,
  DAY_VOTE_READY_LABEL,
  DAY_VOTE_READY_SENDING_LABEL,
  BTN_CLASS,
  BTN_ROW_CLASS,
} from "../../constants/actions/ingameActionPanel.js"

const PHASE_ACTION_ROW_CLASS = `justify-end ${BTN_ROW_CLASS}`

export const PHASE_ACTION_ATTR = "data-ingame-phase-action"

export const INGAME_PHASE_ACTIONS = Object.freeze({
  DAY_READY: "dayReady",
  DAY_VOTE_ABSTAIN: "dayVoteAbstain",
  DAY_VOTE_RESOLVE: "dayVoteResolve",
  TRIBUNAL_RESOLVE: "tribunalResolve",
  NIGHT_SKIP: "nightSkip",
  NIGHT_RESOLVE: "nightResolve",
})

function buildPhaseActions(ctx) {
  const phase = ctx.gameState?.phase ?? null
  const actions = []

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
