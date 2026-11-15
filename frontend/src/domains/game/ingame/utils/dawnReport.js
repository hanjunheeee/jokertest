// 낮 시작 연출 고르기: 밤 결과 → 모두에게 보여 줄 것 (살해당한 사람 / 의사가 살림 / 없음)
// 밤 결과 적용 액션(store/ingame/phaseActions.js)·낮 시작 연출 창(PC InGameDawnReport, 모바일 DawnReportOverlay)이 사용

// 연출 종류: 광대에게 죽은 사람 있음 / 의사가 막아 아무도 안 죽음
export const DAWN_REPORT_KIND = Object.freeze({
  KILLED: "KILLED",
  SAVED: "SAVED",
})

// 광대에게 죽은 원인 값 (서버 사망 공개 source)
const JOKER_SOURCE = "JOKER"

// 의사가 살렸을 때 글 (누구였는지 안 밝힘)
export const DAWN_SAVED_MSG = "지난밤 의사가 공격받은 사람을 살려냈습니다"

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

// 밤 결과 + 그 밤 명단 → 낮 시작 연출 (보여 줄 것 없으면 null)
// players는 밤 결과를 넣기 전 명단(닉네임 찾기용), 명단에 없는 사람은 뺌
export function buildDawnReport({ gameId, nightDayIndex, victimUuid = null, deathReveals, doctorSaved = false, players }) {
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

  // 죽은 사람이 먼저 (둘이 같이 오면 살해 연출만)
  const key = `${gameId}:${nightDayIndex}`
  if (victims.length > 0) {
    return Object.freeze({ key, gameId, nightDayIndex, kind: DAWN_REPORT_KIND.KILLED, victims: Object.freeze(victims) })
  }
  // 옛 서버는 doctorSaved를 안 보냄 → 참일 때만
  if (doctorSaved === true) {
    return Object.freeze({ key, gameId, nightDayIndex, kind: DAWN_REPORT_KIND.SAVED, victims: Object.freeze([]) })
  }
  return null
}

// 연출 글 (직업은 안 보여 줌)
// 예: 살해 [{ nickname: "철수" }] → "지난밤 철수님이 살해당했습니다", 닉네임이 비면 "지난밤 누군가 살해당했습니다"
export function buildDawnReportMessage(report) {
  if (report === null || typeof report !== "object") return null
  if (report.kind === DAWN_REPORT_KIND.SAVED) return DAWN_SAVED_MSG
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
