// 밤 차례 5초 당김 중 새로고침·다시 묻기 스냅샷이 "[5초 뒤 마감]" 표시를 살리는지 화면 상태 시험 (스토어 값·시간 바 고르개만 봄)
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-691~695, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/a2-refresh-settle.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { selectInGameTimebarStatusLabel, selectInGamePhaseSettled } = await import("../../src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js")

test.afterEach(() => useInGameStore.getState().clearGame())

const GAME = "g-a05-a2"
const SETTLE_TEXT = "[5초 뒤 마감]"
const NAMES = ["여름", "가을", "겨울", "새벽", "노을", "구름"]
const uuidOf = (i) => `n${i}`
const state = () => useInGameStore.getState().state

// 6명 둘째 밤 스냅샷 답 (서버 get_session_snapshot 모양, 나는 2번 시민), 차례 직업·마감·phaseSettle은 줄 때만
function nightSnapshot({ role = "JOKER", deadline, phaseSettle, dayIndex = 2 }) {
  return {
    ok: true,
    gameId: GAME,
    phase: "NIGHT",
    dayIndex,
    hostUuid: uuidOf(0),
    participationRevision: 0,
    selfProgressSeq: 0,
    ...(role ? { nightTurnRole: role, nightTurnDeadline: deadline } : {}),
    ...(phaseSettle ? { phaseSettle } : {}),
    players: Array.from({ length: 6 }, (_, i) => ({ uuid: uuidOf(i), nickname: NAMES[i], isAlive: true, isConnected: true, isParticipating: true, themeIndex: i })),
    self: { uuid: uuidOf(2), nickname: NAMES[2], role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
  }
}
const mark = (deadline, override = {}) => ({ phase: "NIGHT", dayIndex: 2, role: "JOKER", deadline, ...override })

// A05-F-691~692 차례 직업마다: 당김 중 새로고침 → 표시 살아남
;["JOKER", "DOCTOR"].forEach((role, i) => {
  test(`A05-F-${691 + i} 6명 둘째 밤 ${role} 차례 5초 당김 중 새로고침(빈 화면에 스냅샷) → 밤 마감 = 당긴 값, 시간 바 글 "[5초 뒤 마감]"·당김 상태 참`, () => {
    const pulled = Date.now() + 3_000
    useInGameStore.getState().bootstrapSessionSnapshot(nightSnapshot({ role, deadline: pulled, phaseSettle: mark(pulled, { role }) }))
    assert.equal(state()?.nightTurnDeadline, pulled, "스냅샷이 안 들어감")
    assert.equal(selectInGameTimebarStatusLabel(state()), SETTLE_TEXT)
    assert.equal(selectInGamePhaseSettled(state()), true)
  })
})

test("A05-F-693 6명 둘째 밤: 당김 없는 광대 차례 중 새로고침(표시 칸 없음) → \"[5초 뒤 마감]\" 없음", () => {
  const deadline = Date.now() + 20_000
  useInGameStore.getState().bootstrapSessionSnapshot(nightSnapshot({ deadline }))
  assert.equal(state()?.nightTurnDeadline, deadline, "스냅샷이 안 들어감")
  assert.notEqual(selectInGameTimebarStatusLabel(state()), SETTLE_TEXT)
  assert.equal(selectInGamePhaseSettled(state()), false)
})

test("A05-F-694 6명 둘째 밤: 광대 차례 표시가 의사 차례 스냅샷에 실려 옴 → 스냅샷은 받고 \"[5초 뒤 마감]\" 없음", () => {
  const pulled = Date.now() + 3_000
  useInGameStore.getState().bootstrapSessionSnapshot(nightSnapshot({ role: "DOCTOR", deadline: pulled, phaseSettle: mark(pulled) }))
  assert.equal(state()?.nightTurnRole, "DOCTOR", "스냅샷이 안 들어감")
  assert.notEqual(selectInGameTimebarStatusLabel(state()), SETTLE_TEXT)
})

test("A05-F-695 6명 둘째 밤: 당김 표시가 있던 밤 화면이 스냅샷을 다시 받음(표시 실림) → \"[5초 뒤 마감]\" 그대로", () => {
  const pulled = Date.now() + 5_000
  const response = nightSnapshot({ deadline: pulled, phaseSettle: mark(pulled) })
  useInGameStore.getState().bootstrapSessionSnapshot(response)
  assert.equal(state()?.phase, "NIGHT", "스냅샷이 안 들어감")
  const before = state()
  // 다시 붙어 받은 스냅샷 (진행 순번만 하나 올라 옴)
  useInGameStore.getState().applySessionSnapshot({ ...response, selfProgressSeq: 1 })
  assert.ok(state() !== before, "두 번째 스냅샷이 안 들어감")
  assert.equal(selectInGameTimebarStatusLabel(state()), SETTLE_TEXT)
})
