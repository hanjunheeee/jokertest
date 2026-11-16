// 밤 화면 시험(화면 상태): 밤 행동을 보낸 뒤 서버 답에 따라 뜨는 글, 다시 고르기·건너뛰기·차례 끝·밤 결과 뒤 상태
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-040~043·087~090, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/submit-state.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")

test.afterEach(() => kit.reset())

// 6명 광대 화면(0 나), 광대 차례 열림, 판 화면 그림
function jokerTurn(n = 6, extra = {}) {
  const t = kit.openNight({ n, me: 0, role: "JOKER", ...extra })
  const view = kit.mountTable()
  t.turnStarts("JOKER")
  return { t, view }
}

// 카드 메뉴로 그 사람에게 밤 행동 보내기 (답이 돌아올 때까지 기다림)
async function pick(view, index, role = "JOKER") {
  const item = kit.openNightItem(view.container, kit.NICKS[index], role)
  assert.ok(item, `${kit.NICKS[index]} 카드에 밤 행동 단추 없음 (준비 잘못)`)
  kit.act(() => { kit.fireEvent.click(item) })
  await kit.settle()
}

test("A05-F-040 7명 광대2: 서버 답 { ok: false, code: TARGET_IS_ALLY } → 글 \"동료 광대는 고를 수 없습니다.\"", async () => {
  const { t, view } = jokerTurn(7, { allies: [1] })
  t.socket.setReply({ ok: false, code: "TARGET_IS_ALLY", message: "요청을 처리할 수 없습니다." })
  await pick(view, 3)
  assert.equal(view.probe.ctx.nightActionError, "동료 광대는 고를 수 없습니다.")
})

test("A05-F-041 모르는 거절 코드에 서버 글이 있으면 그 글", async () => {
  const { t, view } = jokerTurn()
  t.socket.setReply({ ok: false, code: "SOMETHING_NEW", message: "지금은 고를 수 없는 대상입니다." })
  await pick(view, 3)
  assert.equal(view.probe.ctx.nightActionError, "지금은 고를 수 없는 대상입니다.")
})

test("A05-F-042 글 없는 거절 → \"제출하지 못했습니다.\"", async () => {
  const { t, view } = jokerTurn()
  t.socket.setReply({ ok: false })
  await pick(view, 3)
  assert.equal(view.probe.ctx.nightActionError, "제출하지 못했습니다.")
})

test("A05-F-043 받음 { ok: true } → 글 없음", async () => {
  const { view } = jokerTurn()
  await pick(view, 3)
  assert.equal(view.probe.ctx.nightActionError, null)
  assert.equal(view.probe.ctx.nightActionHasSubmitted, true)
})

test("A05-F-087 같은 차례에 보낸 뒤 다른 카드를 고르면 새 대상으로 다시 보냄", async () => {
  const { t, view } = jokerTurn()
  await pick(view, 3)
  await pick(view, 4)
  assert.deepEqual(t.nightSubmits(), [kit.uuidOf(3), kit.uuidOf(4)])
  assert.equal(view.probe.ctx.nightActionLastSubmittedTargetId, kit.uuidOf(4))
})

test("A05-F-088 건너뛰기 → 대상 null로 보냄", async () => {
  const { t, view } = jokerTurn()
  kit.act(() => { kit.fireEvent.click(kit.skipButton(view.container)) })
  await kit.settle()
  assert.deepEqual(t.nightSubmits(), [null])
  assert.equal(t.sent.at(-1).payload.gameId, t.gameId)
})

test("A05-F-089 내 차례 끝 알림 → 고르기 꺼짐", () => {
  const { t, view } = jokerTurn()
  assert.equal(view.probe.ctx.nightActionsLocked, false, "광대 차례가 안 켜짐 (준비 잘못)")
  t.turnEnds("JOKER")
  assert.equal(view.probe.ctx.nightActionsLocked, true)
  assert.equal(kit.skipButton(view.container) === null, true, "건너뛰기 단추가 남음")
})

test("A05-F-090 밤 결과 받으면 밤 행동 상태 처음으로: 보냄 표시·고른 대상 비움", async () => {
  const { t, view } = jokerTurn()
  await pick(view, 3)
  assert.equal(view.probe.ctx.nightActionHasSubmitted, true, "보냄이 안 됨 (준비 잘못)")
  t.turnEnds("JOKER")
  t.actionsResolved()
  t.nightApplied({ victim: 3 })
  const ctx = view.probe.ctx
  assert.equal(ctx.nightActionHasSubmitted, false)
  assert.equal(ctx.nightActionLastSubmittedTargetId, null)
  assert.equal(ctx.selectedNightTargetId, null)
})
