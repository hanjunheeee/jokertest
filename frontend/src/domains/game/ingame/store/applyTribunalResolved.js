import { normalizePublicWinResult } from "../utils/normalizePublicWinResult.js"

const TRIBUNAL_RESOLVED_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

// F-21(AC-03): 피고가 이 판에서 빠져 재판 자체가 성립하지 않은 경우다. 유죄도 무죄도 아니라는
// 뜻이라 위 집합에 넣지 않는다 — 두 정상 판정의 검증(처형 대상·집계 의미)을 그대로 통과시키면
// 취소가 조용히 판정처럼 다뤄진다.
const TRIBUNAL_CANCELLED_OUTCOME = "CANCELLED"
const TRIBUNAL_CANCEL_REASONS = new Set(["DEFENDANT_LEFT"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

/**
 * tribunal_vote_resolved 방송을 store에 반영할지 판정하고, 반영 가능하면 다음 state를
 * 만든다(순수 함수). payload의 gameId/dayIndex/phase/defendantUuid가 store canonical과
 * 전부 일치할 때만 반영하고, 그 외에는 원래 current 참조를 그대로 반환한다(최상위·nested
 * 모두 완전한 no-op). 정상 반영 시 tribunal 결과 필드(outcome/counts/executedUuid/resolved)와,
 * executedUuid가 가리키는 참가자의 alive:false만 갱신한다 — 다른 필드는 건드리지 않는다.
 */
export function applyTribunalResolvedPure(current, payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
  if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
  if (!Number.isInteger(payload.dayIndex)) return current
  if (typeof payload.phase !== "string") return current
  if (typeof payload.defendantUuid !== "string" || payload.defendantUuid.length === 0) return current

  // ── F-21(AC-03): 피고 이탈로 취소된 재판 ─────────────────────────────────
  //
  // 정상 판정과 **같은 조합만** 받아들이는 별도의 엄격 분기다. 아래 GUILTY/NOT_GUILTY 검증을
  // 재사용하지 않는 이유는, 그 검증이 "누가 처형됐는가"와 "집계가 판정을 뜻한다"를 전제하기
  // 때문이다 — 취소에는 처형이 없고, counts는 취소 순간까지 모인 표일 뿐이다.
  //
  // 이 분기는 tribunal UI를 비우고 그날 밤으로 넘어가는 것까지만 한다. 이탈자의 사망은
  // player_eliminated가, 참여 종료는 session_participation_changed가 각각 따로 전달한다 —
  // 한 사건이 세 가지 사실을 함께 바꾸면 그중 하나만 도착한 화면이 어긋난다.
  if (payload.outcome === TRIBUNAL_CANCELLED_OUTCOME) {
    if (payload.phase !== "NIGHT") return current
    if (!TRIBUNAL_CANCEL_REASONS.has(payload.reason)) return current
    if (payload.executedUuid !== null) return current

    const cancelCounts = payload.counts
    if (!cancelCounts || typeof cancelCounts !== "object" || Array.isArray(cancelCounts)) return current
    if (!isNonNegativeInteger(cancelCounts.guilty) || !isNonNegativeInteger(cancelCounts.notGuilty)) return current

    if (!current.gameId || !current.state) return current
    if (payload.gameId !== current.gameId) return current
    if (payload.dayIndex !== current.state.dayIndex) return current
    if (current.state.phase !== "TRIBUNAL") return current
    if (current.state.tribunal?.defendantUuid !== payload.defendantUuid) return current

    return {
      state: {
        ...current.state,
        phase: "NIGHT",
        tribunal: null,
        // players는 건드리지 않는다 — 생존 변화는 이 사건의 사실이 아니다.
      },
    }
  }

  if (!TRIBUNAL_RESOLVED_OUTCOMES.has(payload.outcome)) return current

  const counts = payload.counts
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return current
  if (!isNonNegativeInteger(counts.guilty) || !isNonNegativeInteger(counts.notGuilty)) return current

  if (payload.executedUuid !== null && (typeof payload.executedUuid !== "string" || payload.executedUuid.length === 0)) return current
  if (payload.outcome === "GUILTY" && payload.executedUuid !== payload.defendantUuid) return current
  if (payload.outcome === "NOT_GUILTY" && payload.executedUuid !== null) return current

  if (!current.gameId || !current.state) return current
  if (payload.gameId !== current.gameId) return current
  if (payload.dayIndex !== current.state.dayIndex) return current
  if (current.state.tribunal?.defendantUuid !== payload.defendantUuid) return current

  // 게임 종료(ENDED) payload는 phase가 TRIBUNAL에서 곧바로 ENDED로 전이하므로, 아래 일반
  // phase 일치 검사(TRIBUNAL===TRIBUNAL)를 적용할 수 없다 — 별도 분기에서 완화된 조건으로
  // 검증·적용한다(TRIBUNAL 측 별도 parser를 신설하지 않고 이 함수가 그대로 소유한다).
  if (payload.phase === "ENDED") {
    if (current.state.phase !== "TRIBUNAL") return current
    if (!Array.isArray(payload.players)) return current
    if (!Object.hasOwn(payload, "winResult") || payload.winResult === null) {
      return current
    }
    const winResult = normalizePublicWinResult(payload.winResult)
    if (winResult === null) {
      return current
    }

    const canonicalUuids = new Set((current.state.players ?? []).map((p) => p.uuid))

    const aliveByUuid = new Map()
    for (const p of payload.players) {
      if (p === null || typeof p !== "object" || Array.isArray(p)) return current
      if (typeof p.uuid !== "string" || p.uuid.length === 0) return current
      if (typeof p.isAlive !== "boolean") return current
      if (aliveByUuid.has(p.uuid)) return current
      aliveByUuid.set(p.uuid, p.isAlive)
    }
    if (aliveByUuid.size !== canonicalUuids.size) return current
    for (const uuid of aliveByUuid.keys()) {
      if (!canonicalUuids.has(uuid)) return current
    }

    const nextEndedPlayers = (current.state.players ?? []).map((p) => ({ ...p, alive: aliveByUuid.get(p.uuid) }))

    return {
      state: {
        ...current.state,
        phase: "ENDED",
        tribunal: {
          ...current.state.tribunal,
          outcome: payload.outcome,
          counts: { guilty: counts.guilty, notGuilty: counts.notGuilty },
          executedUuid: payload.executedUuid,
          resolved: true,
        },
        players: nextEndedPlayers,
        winResult,
      },
    }
  }

  // 승리 없는(no-winner) TRIBUNAL 판정은 phase가 TRIBUNAL에서 곧바로 NIGHT로 전이한다(같은
  // dayIndex를 유지한 채 — 위 dayIndex 일치 검사가 이미 이를 보장한다). ENDED 분기와 동일한
  // 이유로 아래 일반 phase 일치 검사(TRIBUNAL===TRIBUNAL)를 적용할 수 없어 별도 분기로
  // 처리한다. tribunal은 이 밤에는 더 이상 의미가 없는 stale UI 상태이므로 null로 비운다
  // (ENDED 분기는 반대로 최종 결과를 계속 보여줘야 하므로 tribunal을 남겨둔다). backend
  // payload에는 players/winResult가 없으므로(비-terminal 판정) executedUuid만으로 생존 상태를
  // 반영한다 — 일반 분기와 동일한 계산이다.
  if (payload.phase === "NIGHT") {
    if (current.state.phase !== "TRIBUNAL") return current

    const nextNightPlayers =
      payload.executedUuid === null
        ? current.state.players
        : (current.state.players ?? []).map((p) => (p.uuid === payload.executedUuid ? { ...p, alive: false } : p))

    return {
      state: {
        ...current.state,
        phase: "NIGHT",
        tribunal: null,
        players: nextNightPlayers,
      },
    }
  }

  if (payload.phase !== current.state.phase) return current

  const nextPlayers =
    payload.executedUuid === null
      ? current.state.players
      : (current.state.players ?? []).map((p) => (p.uuid === payload.executedUuid ? { ...p, alive: false } : p))

  return {
    state: {
      ...current.state,
      tribunal: {
        ...current.state.tribunal,
        outcome: payload.outcome,
        counts: { guilty: counts.guilty, notGuilty: counts.notGuilty },
        executedUuid: payload.executedUuid,
        resolved: true,
      },
      players: nextPlayers,
    },
  }
}
