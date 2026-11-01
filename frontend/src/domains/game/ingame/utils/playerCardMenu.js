// 플레이어 카드 메뉴 순수 계산: 메뉴 항목 만들기·찾기, 고를 때와 지금 범위 비교 (컨텍스트 값만 읽음)
// 카드 메뉴 훅(useInGamePlayerCardMenu)과 hooks/cardMenu/ 파일들이 열기·고르기·제출 직전마다 부름
import {
  DAY_DISCUSSION_NOTICE,
  TRIBUNAL_VOTE_GUILTY_LABEL,
  TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
} from "../constants/actions/ingameActionPanel.js"
import {
  INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL,
  INGAME_CARD_MENU_DAY_VOTE_LABEL,
  INGAME_CARD_MENU_DISABLED_REASONS as REASONS,
  INGAME_CARD_MENU_ITEM_KINDS as KINDS,
  INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL,
  INGAME_CARD_MENU_NIGHT_FALLBACK_LABEL,
  CARD_MENU_SCOPE_FIELDS,
} from "../constants/board/playerCardMenu.js"
import { isInGameSelfPlayer } from "./isInGameSelfPlayer.js"
import { INGAME_DAY_PHASES, resolveInGameDayPhase } from "./resolveInGameDayPhase.js"

// 잠김 이유 고르기 (죽음 → 대상 아님 → 전송 중 → 그 밖)
function disabledReason({ selfAlive, inTargets, submitting }) {
  if (selfAlive === false) return REASONS.selfDead
  if (inTargets === false) return REASONS.notTarget
  if (submitting === true) return REASONS.submitting
  return REASONS.blocked
}

// 하나의 항목 (열려 있으면 이유 없음)
function item(kind, label, enabled, reason, extra = {}) {
  return { kind, label, ...extra, visible: true, enabled, disabledReason: enabled ? null : reason }
}

// 낮 투표 단계: 이 사람에게 이미 냈으면 취소, 아니면 투표
function dayVoteItem(ctx, targetId, selfAlive) {
  const inTargets = Array.isArray(ctx.dayVoteTargets)
    && ctx.dayVoteTargets.some((target) => target.id === targetId)
  const submitting = ctx.dayVoteStatus === "submitting"
  const votedTarget = ctx?.dayVoteHasSubmitted ? (ctx.dayVoteLastSubmittedTargetId ?? null) : null

  if (votedTarget === targetId) {
    const enabled = Boolean(ctx.dayVoteControlsEnabled) && !submitting
    return item(KINDS.DAY_VOTE_CANCEL, INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL, enabled,
      disabledReason({ selfAlive, inTargets: true, submitting }))
  }
  const enabled = Boolean(ctx.dayVoteControlsEnabled) && !submitting && inTargets
  return item(KINDS.DAY_VOTE, INGAME_CARD_MENU_DAY_VOTE_LABEL, enabled,
    disabledReason({ selfAlive, inTargets, submitting }))
}

// 재판: 피고 카드에 유죄·무죄 두 항목 (잠김 이유는 재판 생존까지 봄)
function tribunalItems(ctx, selfAlive) {
  const submitting = ctx.tribunalVoteStatus === "submitting"
  const enabled = Boolean(ctx.tribunalVoteControlsEnabled) && !submitting
  const reason = enabled
    ? null
    : disabledReason({ selfAlive: ctx.tribunalVoteAlive !== false && selfAlive, inTargets: true, submitting })
  return [
    { kind: KINDS.TRIBUNAL_GUILTY, label: TRIBUNAL_VOTE_GUILTY_LABEL, vote: "GUILTY", visible: true, enabled, disabledReason: reason },
    { kind: KINDS.TRIBUNAL_NOT_GUILTY, label: TRIBUNAL_VOTE_NOT_GUILTY_LABEL, vote: "NOT_GUILTY", visible: true, enabled, disabledReason: reason },
  ]
}

// 밤 내 차례: 이 사람에게 이미 행동했으면 취소, 아니면 행동
function nightItem(ctx, targetId, selfAlive) {
  const inTargets = Array.isArray(ctx.nightActionTargets)
    && ctx.nightActionTargets.some((target) => target.id === targetId && target.selectable)
  const submitting = ctx.nightActionStatus === "submitting"
  const actedTarget = ctx?.nightActionLastSubmittedTargetId ?? null

  if (actedTarget === targetId) {
    const enabled = ctx.nightActionsLocked !== true && !submitting
    return item(KINDS.NIGHT_ACTION_CANCEL, INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL, enabled,
      disabledReason({ selfAlive, inTargets: true, submitting }))
  }
  const enabled = ctx.nightActionsLocked !== true && !submitting && inTargets
  return item(KINDS.NIGHT_ACTION, ctx.nightActionLabel || INGAME_CARD_MENU_NIGHT_FALLBACK_LABEL, enabled,
    disabledReason({ selfAlive, inTargets, submitting }))
}

// 대상 카드의 메뉴 항목 목록 (조작 막힘·판 끝이면 빈 목록)
export function buildInGamePlayerCardMenuItems(ctx, targetId, localPlayerId) {
  if (!ctx) return []
  if (typeof targetId !== "string" || targetId.length === 0) return []
  if (ctx.interactionBlocked) return []

  const gameState = ctx.gameState ?? null
  const phase = gameState?.phase ?? null
  if (phase === "ENDED") return []

  const isSelf = isInGameSelfPlayer(targetId, localPlayerId)
  const selfAlive = ctx.selfAliveForControls !== false
  const items = []
  const dayPhase = resolveInGameDayPhase({
    phase,
    dayPhase: gameState?.dayPhase ?? ctx.dayPhase ?? null,
  })

  if (phase === "DAY" && dayPhase === INGAME_DAY_PHASES.VOTE && !isSelf) {
    items.push(dayVoteItem(ctx, targetId, selfAlive))
  }

  // 토론 중엔 투표 항목을 보여 주되 잠금
  if (phase === "DAY" && dayPhase === INGAME_DAY_PHASES.DISCUSSION && !isSelf) {
    items.push(item(KINDS.DAY_VOTE, INGAME_CARD_MENU_DAY_VOTE_LABEL, false, DAY_DISCUSSION_NOTICE))
  }

  if (phase === "TRIBUNAL" && gameState?.tribunal?.defendantUuid === targetId) {
    items.push(...tribunalItems(ctx, selfAlive))
  }

  if (phase === "NIGHT" && ctx.isNightTurnActor && !isSelf) {
    items.push(nightItem(ctx, targetId, selfAlive))
  }

  return items
}

// 종류로 항목 하나 찾기
export function findCardMenuItem(ctx, targetId, localPlayerId, kind) {
  return buildInGamePlayerCardMenuItems(ctx, targetId, localPlayerId).find((entry) => entry.kind === kind) ?? null
}

// 고를 때 범위와 지금 범위가 모든 필드에서 같은지
export function isSameMenuScope(left, right) {
  if (!left || !right) return false
  return CARD_MENU_SCOPE_FIELDS.every((field) => left[field] === right[field])
}
