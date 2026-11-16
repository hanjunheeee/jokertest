// 재판 "표 냈음" 표시 시험: 새 낮·새 재판에 지난 표시가 지워지고 둘째·셋째 날에도 단추를 켤 수 있음 (받은 버그 8)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-001~013
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL } from "./tribunalTable.mjs"

test.afterEach(resetTable)

// 내 표를 냄: 단추 함수 → 서버 성공 답 → 나에게만 오는 "표 냈음" 진행 알림 (서버가 보내는 차례 그대로)
async function castMine(t, vote = "GUILTY") {
  await RTL.act(async () => {
    t.ctx().submitTribunalVote(vote)
  })
  await t.answer("cast_tribunal_vote", t.voteOk(vote))
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
}

// 본인 정보에 재판 표시 칸이 있는지
const hasTribunalFlag = (t) => Object.hasOwn(t.self() ?? {}, "hasSubmittedTribunalVote")

test("A04-F-001 [버그 8] 7명 판: 1일 재판 표 냄 표시가 2일 낮 시작 알림에 지워짐", async () => {
  const t = await openTable({ n: 7 })
  await t.openTribunal(3)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  assert.equal(t.self().hasSubmittedTribunalVote, true)
  await t.resolve("NOT_GUILTY")
  await t.nextDay({ vote: false })
  assert.equal(t.state().dayIndex, 2)
  assert.equal(hasTribunalFlag(t), false)
})

test("A04-F-002 [버그 8] 7명 판: 2일 재판에 들어가도 표시 없음, 피고는 2일 피고", async () => {
  const t = await openTable({ n: 7 })
  await t.openTribunal(3)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  assert.equal(t.state().phase, "TRIBUNAL")
  assert.equal(hasTribunalFlag(t), false)
  assert.equal(t.state().tribunal.defendantUuid, t.uuid(4))
})

test("A04-F-003 [버그 8] 6명 판: 낮 시작에 안 지워진 표시도 2일 재판 진입만으로 지움", async () => {
  const t = await openTable({ n: 6 })
  await t.openTribunal(3)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  // 낮 시작 지우기를 놓친 상태 만들기: 1일 표시가 2일 낮까지 남음
  await t.patchSelf({ hasSubmittedTribunalVote: true })
  assert.equal(t.self().hasSubmittedTribunalVote, true)
  await t.openTribunal(2)
  assert.equal(hasTribunalFlag(t), false)
})

test("A04-F-004 6명 판: 지운 뒤 2일 재판 표를 내면 표시가 다시 켜짐", async () => {
  const t = await openTable({ n: 6 })
  await t.openTribunal(3)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  assert.equal(hasTribunalFlag(t), false)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  assert.equal(t.self().hasSubmittedTribunalVote, true)
})

test("A04-F-005 [버그 8] 8명 판: 1·2일 다 낸 뒤 3일 재판 진입 → 표시 없음", async () => {
  const t = await openTable({ n: 8 })
  await t.openTribunal(3)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(5)
  assert.equal(t.state().dayIndex, 3)
  assert.equal(hasTribunalFlag(t), false)
})

test("A04-F-006 5명 판: 1일 피고였던 나(안 냄)는 2일 재판에서도 표시 없음", async () => {
  const t = await openTable({ n: 5, me: 1 })
  await t.openTribunal(1)
  assert.equal(hasTribunalFlag(t), false)
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(2)
  assert.equal(hasTribunalFlag(t), false)
})

test("A04-F-007 10명 판: 2일 낮 시작에 1일 낮 표 4칸 + 재판 칸 다섯 칸 다 지움", async () => {
  const t = await openTable({ n: 10 })
  await t.myProgress({ hasSubmittedDayVote: true, dayVoteTargetUuid: t.uuid(5), dayVoteRound: 1 }, { done: 1 })
  await t.openTribunal(5)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  const keys = ["hasSubmittedDayVote", "dayVoteTargetUuid", "dayVoteRound", "dayVoteDayIndex", "hasSubmittedTribunalVote"]
  // 지우기 전엔 다섯 칸 다 있음 (지울 것이 있어야 시험이 뜻이 있음)
  assert.deepEqual(keys.filter((key) => Object.hasOwn(t.self(), key)), keys)
  await t.resolve("NOT_GUILTY")
  await t.nextDay({ vote: false })
  assert.deepEqual(keys.filter((key) => Object.hasOwn(t.self(), key)), [])
})

test("A04-F-008 6명 판: 1일 표시가 남아 있어도 2일 재판 스냅샷 false가 덮음", async () => {
  const t = await openTable({ n: 6 })
  await t.openTribunal(3)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  // 1일 표시가 남은 상태 만들기 (지우기를 놓친 화면)
  await t.patchSelf({ hasSubmittedTribunalVote: true })
  assert.equal(t.self().hasSubmittedTribunalVote, true)
  await RTL.act(async () => {
    t.store().applySessionSnapshot(t.snapshot({ self: { hasSubmittedTribunalVote: false } }), null)
  })
  assert.equal(t.self().hasSubmittedTribunalVote, false)
})

test("A04-F-009 [버그 8] 7명 판: 1일 유죄(남 처형)를 낸 사람도 2일 재판에 표시 없음", async () => {
  const t = await openTable({ n: 7 })
  await t.openTribunal(3)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  await t.resolve("GUILTY")
  assert.equal(t.player(3).alive, false)
  await t.nextDay()
  await t.openTribunal(4)
  assert.equal(hasTribunalFlag(t), false)
})

test("A04-F-010 [버그 8] 8명 판: 1일 낸 뒤 2일 재판 훅 값 — 낸 여부 거짓, 단추 켤 조건 참", async () => {
  const t = await openTable({ n: 8, view: "actions" })
  await t.openTribunal(3)
  await castMine(t, "GUILTY")
  assert.equal(t.ctx().tribunalVoteHasSubmitted, true)
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  assert.equal(t.ctx().tribunalVoteHasSubmitted, false)
  assert.equal(t.ctx().tribunalVoteControlsEnabled, true)
})

test("A04-F-011 8명 판: 2일 재판 표 성공 답이면 제출 상태 submitted", async () => {
  const t = await openTable({ n: 8, view: "actions" })
  await t.openTribunal(3)
  await castMine(t, "NOT_GUILTY")
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  await RTL.act(async () => {
    t.ctx().submitTribunalVote("GUILTY")
  })
  assert.equal(t.ctx().tribunalVoteStatus, "submitting")
  await t.answer("cast_tribunal_vote", t.voteOk("GUILTY"))
  assert.equal(t.ctx().tribunalVoteStatus, "submitted")
})

// 1·2·3일 다 내며 새로고침 없이 이어 감, 그 날 재판에 들어간 순간 단추 켤 조건을 봄
;[
  { id: "A04-F-012", n: 5, checkDay: 2 },
  { id: "A04-F-013", n: 10, checkDay: 3 },
].forEach(({ id, n, checkDay }) => {
  test(`${id} [버그 8] ${n}명 판: 1·2·3일 다 냄, ${checkDay}일 재판 진입 때 단추 켤 조건 참`, async () => {
    const t = await openTable({ n, view: "actions" })
    const defendants = [2, 3, 4]
    for (let day = 1; day <= 3; day += 1) {
      await t.openTribunal(defendants[day - 1])
      if (day === checkDay) {
        assert.equal(t.state().dayIndex, checkDay)
        assert.equal(t.ctx().tribunalVoteControlsEnabled, true)
        assert.equal(t.ctx().tribunalVoteHasSubmitted, false)
      }
      await castMine(t, day === 2 ? "NOT_GUILTY" : "GUILTY")
      if (day === 3) break
      await t.resolve("NOT_GUILTY")
      await t.nextDay()
    }
  })
})
