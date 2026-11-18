// 낮 시작 연출 고르기: 밤 결과 → 모두에게 보여 줄 것 (살해당한 사람 / 아무 일도 없음 / 없음)
// 밤 결과 적용·사망 반영·스냅샷 반영 액션(store/ingame/)·낮 시작 연출 창(PC InGameDawnReport, 모바일 DawnReportOverlay)이 사용

// 연출 종류: 광대에게 죽은 사람 있음 / 아무도 안 죽은 밤 (의사가 살렸든 광대가 안 죽였든 같음)
export const DAWN_REPORT_KIND = Object.freeze({
  KILLED: "KILLED",
  QUIET: "QUIET",
})

// 광대에게 죽은 원인 값 (서버 사망 공개 source)
const JOKER_SOURCE = "JOKER"

// 아무도 안 죽은 밤 글 (의사가 살렸는지는 안 밝힘, 사용자 결정 2026-11-18)
export const DAWN_QUIET_MSG = "지난밤 아무 일도 일어나지 않았습니다"

// 광대에게 죽은 사람 uuid 고르기 (사망 공개가 있으면 그것만, 없으면 옛 서버라 victimUuid로 셈)
// 예: [{ victimUuid: "a", source: "JOKER" }] → ["a"], 공개 없음 + victimUuid "b" → ["b"]
function pickKilledUuids(deathReveals, victimUuid) {
  if (Array.isArray(deathReveals)) {
    const uuids = deathReveals
      .filter((reveal) => reveal?.source === JOKER_SOURCE && typeof reveal.victimUuid === "string")
      .map((reveal) => reveal.victimUuid)
    return [...new Set(uuids)]
  }
  return typeof victimUuid === "string" && victimUuid.length > 0 ? [victimUuid] : []
}

// 그 밤 열쇠 (낮 시작 연출·밤 사이 탈락 표시가 같이 씀)
// 예: ("g1", 2) → "g1:2"
export function dawnNightKey(gameId, nightDayIndex) {
  return `${gameId}:${nightDayIndex}`
}

// 밤 사이 산 사람이 죽어 화면에 보였으면(끊김·나가기 탈락) 그 밤 열쇠를 적어 두는 조각 (아니면 빈 조각)
// 사망 반영·스냅샷 반영(store/ingame/)이 바뀌기 전 스토어와 바뀐 조각으로 부름 (바뀐 게 없으면 부르지 않음), 낮 시작 연출이 읽음
// 예: 밤 2에 a가 산 채 → 죽음으로 바뀜 → { nightDepartureKey: "g1:2" }, 낮이거나 바뀐 사람 없음 → {}
export function markNightDeparture(current, patch) {
  const { gameId, state: before } = current
  const afterPlayers = patch?.state?.players
  if (typeof gameId !== "string" || gameId.length === 0) return {}
  if (before?.phase !== "NIGHT" || !Number.isInteger(before.dayIndex)) return {}
  if (!Array.isArray(before.players) || !Array.isArray(afterPlayers)) return {}
  const aliveBefore = new Set(before.players.filter((p) => p?.alive === true).map((p) => p.uuid))
  const someoneDropped = afterPlayers.some((p) => p?.alive === false && aliveBefore.has(p.uuid))
  return someoneDropped ? { nightDepartureKey: dawnNightKey(gameId, before.dayIndex) } : {}
}

// 밤 결과 + 그 밤 명단 → 낮 시작 연출 (보여 줄 것 없으면 null)
// players는 밤 결과를 넣기 전 명단(닉네임 찾기용), 명단에 없는 사람은 뺌
// nightDeparted: 그 밤 사이 탈락(끊김·나가기)이 화면에 보였으면 참 → "아무 일도" 글 안 띄움 (거짓말 안 되게)
// gameEnded: 이 밤 결과로 판이 끝났으면 참 → "아무 일도" 글 없이 바로 결과 화면 (살해 연출은 그대로)
export function buildDawnReport({ gameId, nightDayIndex, victimUuid = null, deathReveals, nightDeparted = false, gameEnded = false, players }) {
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (!Number.isInteger(nightDayIndex)) return null
  const roster = Array.isArray(players) ? players : []
  const nicknameByUuid = new Map(roster.map((p) => [p?.uuid, p?.nickname]))

  const victims = pickKilledUuids(deathReveals, victimUuid)
    .filter((uuid) => nicknameByUuid.has(uuid))
    .map((uuid) => {
      const nickname = nicknameByUuid.get(uuid)
      return { uuid, nickname: typeof nickname === "string" ? nickname.trim() : "" }
    })

  const key = dawnNightKey(gameId, nightDayIndex)
  if (victims.length > 0) {
    return Object.freeze({ key, gameId, nightDayIndex, kind: DAWN_REPORT_KIND.KILLED, victims: Object.freeze(victims) })
  }
  // 아무도 안 죽은 밤: 진짜 밤(1일 밤부터)이고, 사망 공개·희생자가 하나도 없고, 그 밤 사이 탈락이 안 보였고, 판이 안 끝났을 때만
  const anyDeath = Array.isArray(deathReveals)
    ? deathReveals.length > 0
    : typeof victimUuid === "string" && victimUuid.length > 0
  if (nightDayIndex >= 1 && !anyDeath && nightDeparted !== true && gameEnded !== true) {
    return Object.freeze({ key, gameId, nightDayIndex, kind: DAWN_REPORT_KIND.QUIET, victims: Object.freeze([]) })
  }
  return null
}

// 연출 글 (직업은 안 보여 줌)
// 예: 살해 [{ nickname: "철수" }] → "지난밤 철수님이 살해당했습니다", 닉네임이 비면 "지난밤 누군가 살해당했습니다"
export function buildDawnReportMessage(report) {
  if (report === null || typeof report !== "object") return null
  if (report.kind === DAWN_REPORT_KIND.QUIET) return DAWN_QUIET_MSG
  if (report.kind !== DAWN_REPORT_KIND.KILLED) return null
  const names = (report.victims ?? []).map((v) => v?.nickname).filter((name) => typeof name === "string" && name.length > 0)
  if (names.length === 0) return "지난밤 누군가 살해당했습니다"
  return `지난밤 ${names.map((name) => `${name}님`).join(", ")}이 살해당했습니다`
}

// 광대에게 죽은 사람 uuid 모음 (명단 생존 덮을 때 표시용)
export function readDawnKilledUuids(report) {
  if (report?.kind !== DAWN_REPORT_KIND.KILLED) return new Set()
  return new Set((report.victims ?? []).map((v) => v.uuid))
}
