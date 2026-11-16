// 재판 투표 조작 값 시험: 피고·죽은 사람·낸 사람 안내 글, 단추 켤 조건, 한 번만 보내기, 날짜·표 값, 거절·응답 없음 뒤 다시 누름
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-066~085 (A04-F-078은 결정 2026-11-16 오전 둘째 6번: 끊긴 순간 누르면 "연결이 끊겼습니다" 글)
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useFakeClock, tick } from "./tribunalTable.mjs"

test.afterEach(resetTable)

const DEFENDANT_NOTICE = "당신은 피고인입니다. 투표할 수 없습니다."
const DEAD_NOTICE = "사망한 참가자는 투표할 수 없습니다."
const DONE_NOTICE = "투표가 완료되었습니다."

// 재판 중인 판 + 조작 묶음·재판 창 (나는 1번 자리)
async function tribunalTable(n, { defendant = 3, ...options } = {}) {
  const t = await openTable({ n, view: "actions", ...options })
  await t.openTribunal(defendant)
  return t
}

// 단추 함수로 표 보내기
async function send(t, vote = "GUILTY") {
  await RTL.act(async () => {
    t.ctx().submitTribunalVote(vote)
  })
}

// 화면에 그 글이 있는지
const shows = (text) => RTL.screen.queryByText(text) !== null

test("A04-F-066 6명 판: 내가 피고 → \"당신은 피고인입니다. 투표할 수 없습니다.\"", async () => {
  await tribunalTable(6, { defendant: 1 })
  assert.equal(shows(DEFENDANT_NOTICE), true)
})

test("A04-F-067 7명 판: 내가 죽음 → \"사망한 참가자는 투표할 수 없습니다.\"", async () => {
  await tribunalTable(7, { dead: [1] })
  assert.equal(shows(DEAD_NOTICE), true)
})

test("A04-F-068 8명 판: 서버 \"표 냈음\" 표시 참 → \"투표가 완료되었습니다.\"", async () => {
  const t = await tribunalTable(8)
  assert.equal(shows(DONE_NOTICE), false)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  assert.equal(shows(DONE_NOTICE), true)
})

test("A04-F-069 5명 판: 서버 표시 없이 성공 답만 받아도 \"투표가 완료되었습니다.\"", async () => {
  const t = await tribunalTable(5)
  await send(t)
  await t.answer("cast_tribunal_vote", t.voteOk("GUILTY"))
  assert.equal(Object.hasOwn(t.self(), "hasSubmittedTribunalVote"), false)
  assert.equal(t.ctx().tribunalVoteStatus, "submitted")
  assert.equal(shows(DONE_NOTICE), true)
})

test("A04-F-070 6명 판: 산·피고 아님·안 낸 사람은 안내 글 없음", async () => {
  await tribunalTable(6)
  for (const text of [DEFENDANT_NOTICE, DEAD_NOTICE, DONE_NOTICE]) {
    assert.equal(shows(text), false, `${text}가 보임`)
  }
})

test("A04-F-071 7명 판: 1일 처형된 나는 2일 재판에서 사망 안내", async () => {
  const t = await tribunalTable(7, { defendant: 1 })
  await t.resolve("GUILTY")
  await t.nextDay()
  await t.openTribunal(3)
  assert.equal(shows(DEAD_NOTICE), true)
})

test("A04-F-072 6명 판: 재판 피고 uuid = 내 uuid → 피고 참", async () => {
  const t = await tribunalTable(6, { defendant: 1 })
  assert.equal(t.ctx().tribunalVoteIsDefendant, true)
})

test("A04-F-073 8명 판: 본인 죽음 → 살아 있음 거짓", async () => {
  const t = await tribunalTable(8, { dead: [1] })
  assert.equal(t.ctx().tribunalVoteAlive, false)
})

test("A04-F-074 7명 판: 재판 중·산·피고 아님·안 냄 → 단추 켤 조건 참", async () => {
  const t = await tribunalTable(7)
  assert.equal(t.ctx().tribunalVoteControlsEnabled, true)
})

test("A04-F-075 5명 판: 보내는 중에 또 누르면 보내기는 1번", async () => {
  const t = await tribunalTable(5)
  await send(t, "GUILTY")
  assert.equal(t.ctx().tribunalVoteStatus, "submitting")
  await send(t, "GUILTY")
  await send(t, "NOT_GUILTY")
  assert.equal(t.sentOf("cast_tribunal_vote").length, 1)
})

test("A04-F-076 6명 판: submitted 뒤 누르면 안 보냄", async () => {
  const t = await tribunalTable(6)
  await send(t, "NOT_GUILTY")
  await t.answer("cast_tribunal_vote", t.voteOk("NOT_GUILTY"))
  assert.equal(t.ctx().tribunalVoteStatus, "submitted")
  await send(t, "GUILTY")
  assert.equal(t.sentOf("cast_tribunal_vote").length, 1)
})

test("A04-F-077 [버그 8] 8명 판: 1일 submitted → 2일 재판 진입 → 제출 상태 idle", async () => {
  const t = await tribunalTable(8)
  await send(t, "GUILTY")
  await t.answer("cast_tribunal_vote", t.voteOk("GUILTY"))
  assert.equal(t.ctx().tribunalVoteStatus, "submitted")
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  assert.equal(t.ctx().tribunalVoteStatus, "idle")
})

test("A04-F-078 7명 판: 연결이 끊긴 순간 \"유죄\" 누름 → \"연결이 끊겼습니다\" 글이 뜨고 표는 안 나감, 다시 붙으면 글 없어지고 누르면 나감", async () => {
  const t = await tribunalTable(7)
  // 끊김: 소켓이 끊긴 채 (끊김 알림까지 받음)
  t.fake.socket.connected = false
  await t.say("disconnect", "transport close")
  const guilty = RTL.screen.getByRole("button", { name: "유죄" })
  assert.equal(guilty.disabled, false, "끊겨도 단추는 눌려야 글을 띄울 수 있음")
  await t.click(guilty)
  assert.equal(t.sentOf("cast_tribunal_vote").length, 0, "끊긴 채 누른 표가 나감")
  const alert = RTL.screen.getAllByRole("alert").find((el) => /연결이 끊겼습니다/.test(el.textContent))
  assert.ok(alert, "끊김 글이 안 뜸")
  assert.match(t.ctx().tribunalVoteError, /연결이 끊겼습니다/)
  assert.equal(t.ctx().tribunalVoteStatus, "idle")
  // 다시 붙음: 글이 지워지고, 누르면 표가 나감
  t.fake.socket.connected = true
  await t.say("connect")
  assert.equal(t.ctx().tribunalVoteError, null)
  await t.click(RTL.screen.getByRole("button", { name: "유죄" }))
  assert.deepEqual(t.sentOf("cast_tribunal_vote").map((p) => p.vote), ["GUILTY"])
})

test("A04-F-079 6명 판: 행동 묶음 값에 재판 판정 보내기·판정 중 상태가 없음", async () => {
  const t = await tribunalTable(6)
  const keys = Object.keys(t.ctx())
  assert.ok(keys.includes("submitTribunalVote"), "재판 표 보내기는 있어야 함")
  assert.deepEqual(keys.filter((key) => /resolve/i.test(key)), [])
})

test("A04-F-080 [버그 8] 7명 판: 2일 재판 유죄 → cast_tribunal_vote { gameId, dayIndex: 2, vote: GUILTY }", async () => {
  const t = await tribunalTable(7)
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  await send(t, "GUILTY")
  assert.deepEqual(t.sentOf("cast_tribunal_vote"), [{ gameId: t.gameId, dayIndex: 2, vote: "GUILTY" }])
})

;[
  ["A04-F-081", "유죄", "GUILTY"],
  ["A04-F-082", "무죄", "NOT_GUILTY"],
].forEach(([id, label, vote]) => {
  test(`${id} 6명 판: "${label}" 단추 누름 → 표 값 ${vote}`, async () => {
    const t = await tribunalTable(6)
    await t.click(RTL.screen.getByRole("button", { name: label }))
    assert.deepEqual(t.sentOf("cast_tribunal_vote").map((p) => p.vote), [vote])
  })
})

test("A04-F-083 [지금 동작] 8명 판: 보낸 뒤 재판 끝·밤 → 늦게 온 성공 답은 무시", async () => {
  const t = await tribunalTable(8)
  await send(t, "GUILTY")
  await t.resolve("NOT_GUILTY")
  const before = { status: t.ctx().tribunalVoteStatus, vote: t.ctx().tribunalVoteSubmittedVote }
  await t.answer("cast_tribunal_vote", t.voteOk("GUILTY"))
  assert.deepEqual({ status: t.ctx().tribunalVoteStatus, vote: t.ctx().tribunalVoteSubmittedVote }, before)
  assert.equal(t.ctx().tribunalVoteStatus, "idle")
})

test("A04-F-084 5명 판: 거절 답 뒤 상태 idle·단추 켤 조건 참 (다시 누를 수 있음)", async () => {
  const t = await tribunalTable(5)
  await send(t)
  assert.equal(t.ctx().tribunalVoteControlsEnabled, false)
  await t.answer("cast_tribunal_vote", { ok: false, code: "INTERNAL_ERROR", message: "x" })
  assert.equal(t.ctx().tribunalVoteStatus, "idle")
  assert.equal(t.ctx().tribunalVoteControlsEnabled, true)
})

test("A04-F-085 6명 판: 5초 응답 없음 뒤 상태 idle·단추 켤 조건 참", async () => {
  useFakeClock()
  const t = await tribunalTable(6)
  await send(t)
  await tick(5_000)
  assert.equal(t.ctx().tribunalVoteStatus, "idle")
  assert.equal(t.ctx().tribunalVoteControlsEnabled, true)
})
