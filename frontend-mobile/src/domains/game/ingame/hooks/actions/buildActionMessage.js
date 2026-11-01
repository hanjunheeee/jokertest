// 행동 줄 위 안내 한 줄 고르기: 지금 단계 요청 오류 먼저, 없으면 잠김 이유·제출 상태 안내
// 행동 줄 훅(useActionRow)이 부름 (상태 안 건드리는 순수 계산)
import {
  DAY_DEAD_NOTICE,
  DAY_DISCUSSION_NOTICE,
  TRIBUNAL_RESOLVE_DONE_LABEL,
} from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { NIGHT_FALLBACK_LABEL } from "@/domains/game/ingame/constants/board/playerCardMenu.js"
import { resolveInGameTribunalPresentationNotice } from "@/domains/game/ingame/utils/resolveInGameTribunalPresentationNotice.js"
import { getDayVoteRound } from "@/domains/game/ingame/utils/dayVoteRound.js"

const FALLBACK_ERROR = "요청을 처리하지 못했습니다."

// 오류 값은 글 또는 { message } 모양이 섞여 옴
function errorText(error) {
  if (!error) return null
  if (typeof error === "string") return error
  if (typeof error.message === "string" && error.message.length > 0) return error.message
  return FALLBACK_ERROR
}

// 지금 단계에 걸린 요청 오류 (첫 번째 것만)
function phaseError(ctx, phase) {
  const list = phase === "DAY"
    ? [ctx.dayReadyError, ctx.dayVoteError, ctx.dayVoteResolveError]
    : phase === "TRIBUNAL"
      ? [ctx.tribunalVoteError, ctx.tribunalResolveError]
      : phase === "NIGHT" ? [ctx.nightActionError, ctx.resolveNightError] : []
  return list.map(errorText).find(Boolean) ?? null
}

// 낮 안내: 죽음 → 토론 준비 수 → 투표 제출 상태
function dayInfo(ctx, nameOf) {
  if (ctx.selfAliveForControls === false) return DAY_DEAD_NOTICE
  if (ctx.dayPhase === "DAY_DISCUSSION") {
    const counted = Number.isInteger(ctx.dayReadyCount) && Number.isInteger(ctx.dayReadyRequired)
    return counted ? `투표 시작 준비 ${ctx.dayReadyCount}/${ctx.dayReadyRequired}` : DAY_DISCUSSION_NOTICE
  }
  const round = getDayVoteRound(ctx.gameState) === 2 ? "재투표" : "투표"
  if (ctx.dayVoteStatus === "submitting") return "전송 중입니다"
  if (ctx.dayVoteHasSubmitted) {
    const target = ctx.dayVoteLastSubmittedTargetId
    return target ? `${nameOf(target)}에게 ${round}함` : "기권함"
  }
  return `카드를 눌러 ${round} 대상을 고르세요`
}

// 재판 안내: 판정 끝 → 피고·죽음·이미 냄 → 고르기 안내
function tribunalInfo(ctx, nameOf) {
  const tribunal = ctx.gameState?.tribunal ?? null
  if (tribunal?.resolved === true) return TRIBUNAL_RESOLVE_DONE_LABEL
  const notice = resolveInGameTribunalPresentationNotice({
    isDefendant: ctx.tribunalVoteIsDefendant === true,
    alive: ctx.tribunalVoteAlive !== false,
    hasSubmitted: ctx.tribunalVoteHasSubmitted === true,
    status: ctx.tribunalVoteStatus ?? "idle",
  })
  if (notice) return notice
  const defendant = tribunal?.defendantUuid
  return defendant ? `피고 ${nameOf(defendant)}: 유죄·무죄를 고르세요` : null
}

// 밤 안내: 내 차례일 때만 (다른 사람 차례 역할은 진행 바 상태 글이 보여 줌)
function nightInfo(ctx, nameOf) {
  if (!ctx.isNightTurnActor) return null
  const label = ctx.nightActionLabel || NIGHT_FALLBACK_LABEL
  if (ctx.nightActionStatus === "submitting") return "전송 중입니다"
  if (ctx.nightActionsLocked && ctx.resolveNightStatus !== "idle") return "밤 판정이 진행 중입니다"
  const target = ctx.nightActionLastSubmittedTargetId
  if (target) return `${label}: ${nameOf(target)}`
  if (ctx.nightActionHasSubmitted) return "이번 밤 행동을 마침"
  return `카드를 눌러 ${label} 대상을 고르세요`
}

// { text, tone: "error" | "info" } 또는 null
export function buildActionMessage(ctx, nameOf) {
  const phase = ctx.gameState?.phase ?? null
  const error = phaseError(ctx, phase)
  if (error) return { text: error, tone: "error" }

  const text = phase === "DAY"
    ? dayInfo(ctx, nameOf)
    : phase === "TRIBUNAL" ? tribunalInfo(ctx, nameOf)
      : phase === "NIGHT" ? nightInfo(ctx, nameOf) : null
  return text ? { text, tone: "info" } : null
}
