// 행동 줄 버튼 목록 만들기: 데스크톱 단계 행동 줄 + 구석 행동 패널 + 재판 투표를 한 줄로 합침
// 행동 줄 훅(useActionRow)이 행동 컨텍스트 값으로 부름 (상태 안 건드리는 순수 계산)
import {
  DAY_VOTE_READY_DONE_LABEL,
  DAY_VOTE_READY_LABEL,
  DAY_VOTE_READY_SENDING_LABEL,
  TRIBUNAL_RESOLVE_DONE_LABEL,
  TRIBUNAL_RESOLVE_LABEL,
  TRIBUNAL_RESOLVE_RESOLVING_LABEL,
  TRIBUNAL_VOTE_GUILTY_LABEL,
  TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
} from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"
import {
  INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL,
  INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL,
} from "@/domains/game/ingame/constants/board/playerCardMenu.js"

// 단계 행동 표시 값 (데스크톱 data-ingame-phase-action 값과 같게, 시험이 찾음)
export const ROW_ACTIONS = Object.freeze({
  VOTE_STATUS: "voteStatus",
  DAY_READY: "dayReady",
  DAY_VOTE_ABSTAIN: "dayVoteAbstain",
  DAY_VOTE_CANCEL: "dayVoteCancel",
  DAY_VOTE_RESOLVE: "dayVoteResolve",
  TRIBUNAL_GUILTY: "tribunalGuilty",
  TRIBUNAL_NOT_GUILTY: "tribunalNotGuilty",
  TRIBUNAL_RESOLVE: "tribunalResolve",
  NIGHT_SKIP: "nightSkip",
  NIGHT_CANCEL: "nightCancel",
  NIGHT_RESOLVE: "nightResolve",
})

// 버튼 하나 (tone: 그림 고르기 accept·cancel·skip, plain은 글자 버튼)
const entry = (action, label, enabled, onClick, tone = "plain") => ({ action, label, enabled, onClick, tone })

// 낮 토론: 준비 (글자는 보내는 중·끝남 따라)
function dayDiscussionActions(ctx) {
  const label = ctx.dayReadyStatus === "sending"
    ? DAY_VOTE_READY_SENDING_LABEL
    : ctx.dayReadyStatus === "ready" ? DAY_VOTE_READY_DONE_LABEL : DAY_VOTE_READY_LABEL
  return [entry(ROW_ACTIONS.DAY_READY, label, Boolean(ctx.dayReadyControlsEnabled), ctx.submitDayReady, "accept")]
}

// 낮 투표: 고른 대상이 있으면 투표취소(카드 메뉴 취소와 같음), 없으면 기권 + 낮 집계
function dayVoteActions(ctx) {
  const submitting = ctx.dayVoteStatus === "submitting"
  const votedTarget = ctx.dayVoteHasSubmitted ? (ctx.dayVoteLastSubmittedTargetId ?? null) : null
  const first = votedTarget
    ? entry(ROW_ACTIONS.DAY_VOTE_CANCEL, INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL,
      Boolean(ctx.dayVoteControlsEnabled) && !submitting, ctx.abstainDayVote, "cancel")
    : entry(ROW_ACTIONS.DAY_VOTE_ABSTAIN, "기권",
      Boolean(ctx.dayVoteControlsEnabled) && !submitting && ctx.dayVoteHasSubmitted !== true,
      ctx.abstainDayVote, "cancel")
  const resolveLabel = ctx.dayVoteResolveStatus === "resolving"
    ? "집계 중..."
    : ctx.dayVoteResolveStatus === "resolved" ? "집계 완료" : "낮 집계"
  return [
    first,
    entry(ROW_ACTIONS.DAY_VOTE_RESOLVE, resolveLabel, Boolean(ctx.dayVoteResolveControlsEnabled), ctx.resolveDayVote),
  ]
}

// 재판 투표 버튼을 보일지 (재판 연출 문지기와 같은 조건: 피고 아님·생존·아직 안 냄)
export function canShowTribunalVote(ctx) {
  return !ctx.tribunalVoteIsDefendant
    && ctx.tribunalVoteAlive !== false
    && ctx.tribunalVoteHasSubmitted !== true
    && ctx.tribunalVoteStatus !== "submitted"
}

// 재판: 유죄·무죄(보일 때만) + 재판 판정
function tribunalActions(ctx) {
  const actions = []
  if (canShowTribunalVote(ctx) && ctx.gameState?.tribunal?.resolved !== true) {
    const enabled = Boolean(ctx.tribunalVoteControlsEnabled) && ctx.tribunalVoteStatus !== "submitting"
    actions.push(
      entry(ROW_ACTIONS.TRIBUNAL_GUILTY, TRIBUNAL_VOTE_GUILTY_LABEL, enabled,
        () => ctx.submitTribunalVote?.("GUILTY"), "cancel"),
      entry(ROW_ACTIONS.TRIBUNAL_NOT_GUILTY, TRIBUNAL_VOTE_NOT_GUILTY_LABEL, enabled,
        () => ctx.submitTribunalVote?.("NOT_GUILTY"), "accept"),
    )
  }
  const resolveLabel = ctx.gameState?.tribunal?.resolved === true
    ? TRIBUNAL_RESOLVE_DONE_LABEL
    : ctx.tribunalResolveLocked ? TRIBUNAL_RESOLVE_RESOLVING_LABEL : TRIBUNAL_RESOLVE_LABEL
  actions.push(entry(ROW_ACTIONS.TRIBUNAL_RESOLVE, resolveLabel,
    Boolean(ctx.tribunalResolveControlsEnabled), ctx.resolveTribunalVote))
  return actions
}

// 밤 내 차례: 행동한 대상이 있으면 취소하기(카드 메뉴 취소와 같음), 없으면 건너뛰기 + 밤 종료
function nightActions(ctx) {
  const submitting = ctx.nightActionStatus === "submitting"
  const actedTarget = ctx.nightActionLastSubmittedTargetId ?? null
  const first = actedTarget
    ? entry(ROW_ACTIONS.NIGHT_CANCEL, INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL,
      ctx.nightActionsLocked !== true && !submitting, ctx.skipNightAction, "cancel")
    : entry(ROW_ACTIONS.NIGHT_SKIP, "건너뛰기",
      ctx.nightActionsLocked !== true && !submitting && ctx.nightActionHasSubmitted !== true,
      ctx.skipNightAction, "skip")
  const resolveLabel = ctx.resolveNightStatus === "resolving"
    ? "판정 중..."
    : ctx.resolveNightStatus === "resolved" ? "판정 완료" : "밤 종료"
  return [first, entry(ROW_ACTIONS.NIGHT_RESOLVE, resolveLabel, ctx.resolveNightStatus === "idle", ctx.resolveNight)]
}

// 지금 단계 버튼 목록 (투표 현황은 데스크톱처럼 늘 맨 앞)
export function buildRowActions(ctx, openVoteStatus) {
  const phase = ctx.gameState?.phase ?? null
  const actions = [entry(ROW_ACTIONS.VOTE_STATUS, "투표 현황", true, openVoteStatus, "accept")]
  if (phase === "ENDED") return actions
  if (phase === "DAY" && ctx.dayPhase === "DAY_DISCUSSION") actions.push(...dayDiscussionActions(ctx))
  if (phase === "DAY" && ctx.dayPhase === "DAY_VOTE") actions.push(...dayVoteActions(ctx))
  if (phase === "TRIBUNAL") actions.push(...tribunalActions(ctx))
  if (phase === "NIGHT" && ctx.isNightTurnActor) actions.push(...nightActions(ctx))
  return actions
}
