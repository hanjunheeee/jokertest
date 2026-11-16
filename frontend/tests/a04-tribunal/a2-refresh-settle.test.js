// 재판 5초 당김 중 새로고침·다시 묻기 스냅샷이 "[5초 뒤 마감]" 표시를 살리는지 화면 상태 시험 (스토어 값·시간 바 고르개만 봄)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-282~285
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { selectInGameTimebarStatusLabel, selectInGamePhaseSettled } = await import("../../src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js")

test.afterEach(() => useInGameStore.getState().clearGame())

const GAME = "g-a04-a2"
const SETTLE_TEXT = "[5초 뒤 마감]"
const TRIBUNAL_TEXT = "[재판-진행 중]"
const NAMES = ["가람", "나래", "다솜", "라온", "마루", "바다", "사랑"]
const uuidOf = (i) => `t${i}`
const state = () => useInGameStore.getState().state

// 재판 중 스냅샷 답 (서버 get_session_snapshot 모양, 나는 0번 시민·피고는 3번), phaseSettle은 줄 때만
function tribunalSnapshot({ n, dayIndex = 1, deadline, phaseSettle }) {
  return {
    ok: true,
    gameId: GAME,
    phase: "TRIBUNAL",
    dayIndex,
    hostUuid: uuidOf(0),
    participationRevision: 0,
    selfProgressSeq: 0,
    tribunalDeadline: deadline,
    ...(phaseSettle ? { phaseSettle } : {}),
    players: Array.from({ length: n }, (_, i) => ({ uuid: uuidOf(i), nickname: NAMES[i], isAlive: true, isConnected: true, isParticipating: true, themeIndex: i })),
    self: { uuid: uuidOf(0), nickname: NAMES[0], role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: true, hasSubmittedTribunalVote: true },
    tribunal: { defendantUuid: uuidOf(3), resolved: false },
  }
}
const mark = (deadline, override = {}) => ({ phase: "TRIBUNAL", dayIndex: 1, role: null, deadline, ...override })

test("A04-F-282 6명 판: 재판 5초 당김 중 새로고침(빈 화면에 스냅샷) → 재판 마감 = 당긴 값, 시간 바 글 \"[5초 뒤 마감]\"·당김 상태 참", () => {
  const pulled = Date.now() + 3_000
  useInGameStore.getState().bootstrapSessionSnapshot(tribunalSnapshot({ n: 6, deadline: pulled, phaseSettle: mark(pulled) }))
  assert.equal(state()?.tribunalDeadline, pulled, "스냅샷이 안 들어감")
  assert.equal(selectInGameTimebarStatusLabel(state()), SETTLE_TEXT)
  assert.equal(selectInGamePhaseSettled(state()), true)
})

test("A04-F-283 6명 판: 당김 없는 재판 중 새로고침(표시 칸 없음) → 재판 기본 글", () => {
  const deadline = Date.now() + 40_000
  useInGameStore.getState().bootstrapSessionSnapshot(tribunalSnapshot({ n: 6, deadline }))
  assert.equal(state()?.tribunalDeadline, deadline, "스냅샷이 안 들어감")
  assert.equal(selectInGameTimebarStatusLabel(state()), TRIBUNAL_TEXT)
  assert.equal(selectInGamePhaseSettled(state()), false)
})

test("A04-F-284 7명 판: 낮 단계 표시가 재판 스냅샷에 실려 옴 → 스냅샷은 받고 글은 재판 기본 글", () => {
  const pulled = Date.now() + 3_000
  useInGameStore.getState().bootstrapSessionSnapshot(tribunalSnapshot({ n: 7, deadline: pulled, phaseSettle: mark(pulled, { phase: "DAY" }) }))
  assert.equal(state()?.tribunalDeadline, pulled, "스냅샷이 안 들어감")
  assert.equal(selectInGameTimebarStatusLabel(state()), TRIBUNAL_TEXT)
})

test("A04-F-285 6명 판: 당김 표시가 있던 재판 화면이 스냅샷을 다시 받음(표시 실림) → \"[5초 뒤 마감]\" 그대로", () => {
  const pulled = Date.now() + 5_000
  const response = tribunalSnapshot({ n: 6, deadline: pulled, phaseSettle: mark(pulled) })
  useInGameStore.getState().bootstrapSessionSnapshot(response)
  assert.equal(state()?.phase, "TRIBUNAL", "스냅샷이 안 들어감")
  const before = state()
  // 다시 붙어 받은 스냅샷 (진행 순번만 하나 올라 옴)
  useInGameStore.getState().applySessionSnapshot({ ...response, selfProgressSeq: 1 })
  assert.ok(state() !== before, "두 번째 스냅샷이 안 들어감")
  assert.equal(selectInGameTimebarStatusLabel(state()), SETTLE_TEXT)
})
