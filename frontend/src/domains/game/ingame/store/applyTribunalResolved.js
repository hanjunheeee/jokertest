import { normalizeWinResult } from "../utils/normalizeWinResult.js"

const TRIBUNAL_RESOLVED_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

/**
 * tribunal_vote_resolved 방송을 store에 반영할지 판정하고, 반영 가능하면 다음 state를
 * 만든다(순수 함수). payload의 gameId/dayIndex/phase/defendantUuid가 store canonical과
 * 전부 일치할 때만 반영하고, 그 외에는 원래 current 참조를 그대로 반환한다(최상위·nested
 * 모두 완전한 no-op). 정상 반영 시 tribunal 결과 필드(outcome/counts/executedUuid/resolved)와,
 * executedUuid가 가리키는 참가자의 alive:false만 갱신한다 — 다른 필드는 건드리지 않는다.
 * 종료(ENDED) 판정의 winResult는 winner만 잘라내지 않고 normalizeWinResult가 정규화한
 * { winner, reveals, mvp } 전체를 store에 남긴다 — 결과 페이지가 reveals를 읽어야 한다.
 */
export function applyTribunalResolvedPure(current, payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
  if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
  if (!Number.isInteger(payload.dayIndex)) return current
  if (typeof payload.phase !== "string") return current
  if (typeof payload.defendantUuid !== "string" || payload.defendantUuid.length === 0) return current
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
    // winResult 값의 검증·정규화(reveals/mvp 포함)는 세 파서가 공유하는 normalizeWinResult가
    // 전담한다 — 여기서는 "종료 payload에는 winResult 필드가 반드시 있어야 한다"만 본다.
    if (!Object.hasOwn(payload, "winResult")) return current
    const winResult = normalizeWinResult(payload.winResult)
    if (winResult === null) return current

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
