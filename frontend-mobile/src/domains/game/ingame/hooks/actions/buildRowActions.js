// 행동 줄 버튼 목록 만들기: 데스크톱 구석 행동 패널(그림 버튼) + 단계 행동 줄(글자 버튼) 두 묶음
// 행동 줄 훅(useActionRow)이 행동 컨텍스트 값으로 부름 (상태 안 건드리는 순수 계산)
import {
  DAY_VOTE_READY_DONE_LABEL,
  DAY_VOTE_READY_LABEL,
  DAY_VOTE_READY_SENDING_LABEL,
  TRIBUNAL_RESOLVE_DONE_LABEL,
  TRIBUNAL_RESOLVE_LABEL,
  TRIBUNAL_RESOLVE_RESOLVING_LABEL,
} from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"

// 단계 행동 표시 값 (데스크톱 data-ingame-phase-action 값과 같게, 시험이 찾음)
export const ROW_ACTIONS = Object.freeze({
  DAY_READY: "dayReady",
  DAY_VOTE_ABSTAIN: "dayVoteAbstain",
  DAY_VOTE_RESOLVE: "dayVoteResolve",
  TRIBUNAL_RESOLVE: "tribunalResolve",
  NIGHT_SKIP: "nightSkip",
  NIGHT_RESOLVE: "nightResolve",
})

// 데스크톱 단계 행동 줄 글자 (데스크톱은 화면 파일 안 글이라 import 못 함 → 같은 글 둠)
const DAY_VOTE_RESOLVE_LABELS = { resolving: "집계 중...", resolved: "집계 완료", idle: "낮 집계" }
const NIGHT_RESOLVE_LABELS = { resolving: "판정 중...", resolved: "판정 완료", idle: "밤 종료" }

// 버튼 하나 (kind: voteStatus·abstain·skip은 그림 버튼 고르기, phase는 글자 버튼)
const entry = (action, label, enabled, onClick, kind) => ({ action, label, enabled, onClick, kind })

// 구석 패널: 투표 현황(늘) · 기권(낮 투표) · 건너뛰기(내 밤 차례), 꺼짐 조건은 데스크톱과 같음
export function buildCornerActions(ctx, openVoteStatus) {
  const phase = ctx.gameState?.phase ?? null
  const actions = [entry(null, "투표 현황", true, openVoteStatus, "voteStatus")]
  if (phase === "DAY" && ctx.dayPhase === "DAY_VOTE") {
    const disabled = !ctx.dayVoteControlsEnabled
      || ctx.dayVoteStatus === "submitting"
      || ctx.dayVoteHasSubmitted === true
    actions.push(entry(ROW_ACTIONS.DAY_VOTE_ABSTAIN, "기권", !disabled, ctx.abstainDayVote, "abstain"))
  }
  if (phase === "NIGHT" && ctx.isNightTurnActor) {
    const disabled = ctx.nightActionsLocked === true
      || ctx.nightActionStatus === "submitting"
      || ctx.nightActionHasSubmitted === true
    actions.push(entry(ROW_ACTIONS.NIGHT_SKIP, "건너뛰기", !disabled, ctx.skipNightAction, "skip"))
  }
  return actions
}

// 단계 행동 줄: 낮 준비 · 낮 집계 · 재판 판정 · 밤 종료 (데스크톱 InGamePhaseActionRow와 같은 순서·조건)
export function buildPhaseActions(ctx) {
  const phase = ctx.gameState?.phase ?? null
  const actions = []
  if (phase === "DAY" && ctx.dayPhase === "DAY_DISCUSSION") {
    const label = ctx.dayReadyStatus === "sending"
      ? DAY_VOTE_READY_SENDING_LABEL
      : ctx.dayReadyStatus === "ready" ? DAY_VOTE_READY_DONE_LABEL : DAY_VOTE_READY_LABEL
    actions.push(entry(ROW_ACTIONS.DAY_READY, label, Boolean(ctx.dayReadyControlsEnabled), ctx.submitDayReady, "phase"))
  }
  if (phase === "DAY" && ctx.dayPhase === "DAY_VOTE") {
    const label = DAY_VOTE_RESOLVE_LABELS[ctx.dayVoteResolveStatus] ?? DAY_VOTE_RESOLVE_LABELS.idle
    actions.push(entry(ROW_ACTIONS.DAY_VOTE_RESOLVE, label, Boolean(ctx.dayVoteResolveControlsEnabled), ctx.resolveDayVote, "phase"))
  }
  if (phase === "TRIBUNAL") {
    const label = ctx.gameState?.tribunal?.resolved === true
      ? TRIBUNAL_RESOLVE_DONE_LABEL
      : ctx.tribunalResolveLocked ? TRIBUNAL_RESOLVE_RESOLVING_LABEL : TRIBUNAL_RESOLVE_LABEL
    actions.push(entry(ROW_ACTIONS.TRIBUNAL_RESOLVE, label, Boolean(ctx.tribunalResolveControlsEnabled), ctx.resolveTribunalVote, "phase"))
  }
  if (phase === "NIGHT" && ctx.isNightTurnActor) {
    const label = NIGHT_RESOLVE_LABELS[ctx.resolveNightStatus] ?? NIGHT_RESOLVE_LABELS.idle
    actions.push(entry(ROW_ACTIONS.NIGHT_RESOLVE, label, ctx.resolveNightStatus === "idle", ctx.resolveNight, "phase"))
  }
  return actions
}
