// 행동 줄 버튼 목록 만들기: 데스크톱 구석 행동 패널(그림 버튼) + 단계 행동 줄(글자 버튼) 두 묶음
// 행동 줄 훅(useActionRow)이 행동 컨텍스트 값으로 부름 (상태 안 건드리는 순수 계산)
import {
  DAY_VOTE_READY_DONE_LABEL,
  DAY_VOTE_READY_LABEL,
  DAY_VOTE_READY_SENDING_LABEL,
} from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"

// 단계 행동 표시 값 (데스크톱 data-ingame-phase-action 값과 같게, 시험이 찾음)
// 낮 집계·재판 판정·밤 종료는 없어짐 (판정은 표가 다 차면 서버가 5초 뒤 함)
export const ROW_ACTIONS = Object.freeze({
  DAY_READY: "dayReady",
  DAY_VOTE_ABSTAIN: "dayVoteAbstain",
  NIGHT_SKIP: "nightSkip",
})

// 버튼 하나 (kind: voteStatus·abstain·skip은 그림 버튼 고르기, phase는 글자 버튼)
const entry = (action, label, enabled, onClick, kind) => ({ action, label, enabled, onClick, kind })

// 구석 패널: 투표 현황(늘) · 기권(낮 투표) · 건너뛰기(내 밤 차례), 꺼짐 조건은 데스크톱과 같음
export function buildCornerActions(ctx, openVoteStatus) {
  const phase = ctx.gameState?.phase ?? null
  const actions = [entry(null, "투표 현황", true, openVoteStatus, "voteStatus")]
  // 죽은 사람은 표를 못 내니 기권도 안 그림 (데스크톱과 같음)
  if (phase === "DAY" && ctx.dayPhase === "DAY_VOTE" && ctx.selfAliveForControls !== false) {
    const disabled = !ctx.dayVoteControlsEnabled
      || ctx.dayVoteStatus === "submitting"
      || ctx.dayVoteHasSubmitted === true
    actions.push(entry(ROW_ACTIONS.DAY_VOTE_ABSTAIN, "기권", !disabled, ctx.abstainDayVote, "abstain"))
  }
  // 죽은 사람은 못 고르니 건너뛰기를 안 그림 (데스크톱과 같음)
  if (phase === "NIGHT" && ctx.isNightTurnActor && ctx.selfAliveForControls !== false) {
    const disabled = ctx.nightActionsLocked === true
      || ctx.nightActionStatus === "submitting"
      || ctx.nightActionHasSubmitted === true
    actions.push(entry(ROW_ACTIONS.NIGHT_SKIP, "건너뛰기", !disabled, ctx.skipNightAction, "skip"))
  }
  return actions
}

// 낮 준비 버튼 글: 보내는 중 / 준비 끝 / 준비
function dayReadyLabel(status) {
  if (status === "sending") return DAY_VOTE_READY_SENDING_LABEL
  if (status === "ready") return DAY_VOTE_READY_DONE_LABEL
  return DAY_VOTE_READY_LABEL
}

// 단계 행동 줄: 낮 토론 때 준비 하나 (데스크톱 InGamePhaseActionRow와 같은 조건, 죽은 사람은 준비할 일이 없어 안 그림)
export function buildPhaseActions(ctx) {
  const phase = ctx.gameState?.phase ?? null
  if (phase !== "DAY" || ctx.dayPhase !== "DAY_DISCUSSION") return []
  if (ctx.selfAliveForControls === false) return []
  const label = dayReadyLabel(ctx.dayReadyStatus)
  return [entry(ROW_ACTIONS.DAY_READY, label, Boolean(ctx.dayReadyControlsEnabled), ctx.submitDayReady, "phase")]
}
