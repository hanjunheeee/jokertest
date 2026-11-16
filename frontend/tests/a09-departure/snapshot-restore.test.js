// 끊겼다 다시 붙은 뒤 스냅샷 반영 시험(화면 상태): 단계·남은 시간, 내 직업·같은 직업 동료, 끊긴 동안 열린 재판·투표 판정·내 표 기권, 끊긴 동안 내가 죽음
// 목록 A09-끊김-나가기-탈주.md A09-F-133~147, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/snapshot-restore.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { selectInGameTimebarPhaseDeadline } = await import("../../src/domains/game/ingame/utils/timebar/phaseDeadline.js")
const { selectInGameDeadParticipantChoice } = await import("../../src/domains/game/ingame/utils/selectInGameDeadParticipantChoice.js")

test.afterEach(() => K.reset())

// 끊기기 전 단계 → 다시 붙었을 때 서버 스냅샷 단계 (값 6)
// before: 끊기기 전 판, after: 다시 붙을 때 판 단계 (deadline = 지금 + 30초)
const PHASE_CASES = [
  ["A09-F-133", "역할 확인", 5, { phase: "ROLE_REVEAL" }, { phase: "ROLE_REVEAL" }],
  ["A09-F-134", "토론", 6, { phase: "ROLE_REVEAL" }, { phase: "DAY", dayPhase: "DAY_DISCUSSION" }],
  ["A09-F-135", "투표", 7, { phase: "DAY", dayPhase: "DAY_DISCUSSION" }, { phase: "DAY", dayPhase: "DAY_VOTE" }],
  ["A09-F-136", "재판", 8, { phase: "DAY", dayPhase: "DAY_VOTE" }, { phase: "TRIBUNAL", defendant: 4 }],
  ["A09-F-137", "밤 내 차례", 10, { phase: "DAY", dayPhase: "DAY_VOTE", myRole: "DOCTOR" }, { phase: "NIGHT", turn: "DOCTOR" }],
  ["A09-F-138", "밤 남 차례", 6, { phase: "DAY", dayPhase: "DAY_VOTE" }, { phase: "NIGHT", turn: "JOKER" }],
]

for (const [id, label, n, before, after] of PHASE_CASES) {
  test(`${id} ${n}명 판 ${label} 스냅샷으로 다시 붙음 → 스토어 단계·남은 시간 = 마감 − 지금`, async () => {
    const roles = before.myRole ? { 1: before.myRole } : {}
    const t = K.seat({ n, me: 1, jokers: [0], roles, phase: before.phase, dayPhase: before.dayPhase ?? "DAY_VOTE" })
    await K.renderSnapshotProbe()
    // 서버 판이 그 단계로 넘어간 뒤 다시 붙음
    t.phase = after.phase
    t.dayPhase = after.dayPhase ?? t.dayPhase
    t.defendant = after.defendant ?? null
    const deadline = Date.now() + 30_000
    const over = { phase: after.phase }
    if (after.phase === "DAY") Object.assign(over, { dayPhase: after.dayPhase, dayPhaseDeadline: deadline })
    if (after.phase === "TRIBUNAL") over.tribunalDeadline = deadline
    if (after.phase === "NIGHT") Object.assign(over, { nightTurnRole: after.turn, nightTurnDeadline: deadline })
    await K.reconnectWith(t, t.snapshot(over))
    const state = t.state()
    assert.equal(state.phase, after.phase)
    if (after.phase === "DAY") assert.equal(state.dayPhase, after.dayPhase)
    if (after.phase === "ROLE_REVEAL") {
      // 역할 확인 스냅샷엔 서버 마감 칸이 없음 → 화면도 마감 없음
      assert.equal(selectInGameTimebarPhaseDeadline(state), null)
      return
    }
    const shown = selectInGameTimebarPhaseDeadline(state)
    assert.equal(shown, deadline, "스토어 마감이 서버 마감과 다름")
    const left = shown - Date.now()
    assert.ok(left > 29_000 && left <= 30_000, `남은 시간 ${left}ms`)
  })
}

// 내 직업·같은 직업 동료 (값 5): 8명 판, 나 1번, 같은 직업 동료 5번 (시민은 동료 없음)
const ROLE_CASES = [
  ["A09-F-139", "JOKER"],
  ["A09-F-140", "DOCTOR"],
  ["A09-F-141", "GUARD"],
  ["A09-F-142", "WITCH_HUNTER"],
  ["A09-F-143", "CITIZEN"],
]
for (const [id, role] of ROLE_CASES) {
  test(`${id} 8명 판 ${K.ROLE_LABELS[role]}가 다시 붙음 → 내 직업 ${K.ROLE_LABELS[role]}, ${role === "CITIZEN" ? "동료 없음" : "동료 = 같은 직업 1명"}`, async () => {
    const roles = role === "CITIZEN" ? { 1: "CITIZEN", 5: "CITIZEN" } : { 1: role, 5: role }
    const t = K.seat({ n: 8, me: 1, roles, jokers: role === "JOKER" ? [] : [0, 6] })
    await K.renderSnapshotProbe()
    await K.reconnectWith(t, t.snapshot())
    const self = t.state().self
    assert.equal(self.role, role)
    if (role === "CITIZEN") {
      assert.equal(Array.isArray(self.allies) && self.allies.length > 0, false)
    } else {
      assert.deepEqual(self.allies, [t.uuid(5)])
    }
  })
}

test("A09-F-144 7명 판 투표 중 끊김 → 그사이 재판 열림 → 붙음 → 재판 상태(피고 3번)", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0] })
  await K.renderSnapshotProbe()
  t.phase = "TRIBUNAL"
  t.defendant = 3
  await K.reconnectWith(t, t.snapshot())
  assert.equal(t.state().phase, "TRIBUNAL")
  assert.equal(t.state().tribunal?.defendantUuid, t.uuid(3))
})

test("A09-F-145 8명 판 투표 중 끊김 → 그사이 투표 판정(재판) → 붙음 → 판정 결과 반영", async () => {
  const t = K.seat({ n: 8, me: 1, jokers: [0, 2] })
  await K.renderSnapshotProbe()
  t.phase = "TRIBUNAL"
  t.defendant = 4
  await K.reconnectWith(t, t.snapshot())
  const resolution = t.state().dayVoteResolution
  assert.equal(resolution?.outcome, "TRIBUNAL")
  assert.equal(resolution?.tribunalTargetUuid, t.uuid(4))
})

test("A09-F-146 6명 판 표 낸 뒤 끊김 → 그사이 내 표 기권 → 붙음 → \"표 냈음\" 꺼짐", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0], selfExtra: { hasSubmittedDayVote: true } })
  K.RTL.act(() => {
    K.useInGameStore.setState((s) => ({ state: { ...s.state, self: { ...s.state.self, dayVoteTargetUuid: t.uuid(3) } } }))
  })
  assert.equal(t.state().self.hasSubmittedDayVote, true, "처음엔 표 냈음")
  await K.renderSnapshotProbe()
  await K.reconnectWith(t, t.snapshot({ self: { hasSubmittedDayVote: false, dayVoteTargetUuid: null } }))
  assert.equal(t.state().self.hasSubmittedDayVote, false)
})

test("A09-F-147 10명 판 끊긴 동안 내가 죽음 → 스냅샷 내 칸 alive false → 사망 창 상태", async () => {
  const t = K.seat({ n: 10, me: 4, jokers: [0, 1] })
  await K.renderSnapshotProbe()
  t.seats[4].alive = false
  await K.reconnectWith(t, t.snapshot())
  assert.equal(t.player(4).alive, false)
  assert.equal(selectInGameDeadParticipantChoice(t.state(), t.me), true)
})
