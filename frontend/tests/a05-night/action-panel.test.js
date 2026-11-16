// 밤 화면 시험(화면 부품): 행동 칸 — 내 차례에만 대상 고르기(건너뛰기 단추·카드 밤 단추)가 있는지, 건너뛰기 보냄, 거절 글이 칸에 그려지는지
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-135~148·178~181·189, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/action-panel.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")

test.afterEach(() => kit.reset())

const ROLES = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]
const dayFor = (role) => (role === "WITCH_HUNTER" ? 2 : 1)
// 그 직업이 고를 수 있는 사람 (마녀사냥꾼은 죽은 3, 나머지는 산 4)
const targetFor = (role) => (role === "WITCH_HUNTER" ? 3 : 4)

// 대상 고르기 있음 = 눌리는 건너뛰기 단추 + 대상 카드에 눌리는 밤 단추, 없음 = 둘 다 없음
function pickingUi(view, role) {
  const skip = kit.skipButton(view.container)
  const item = kit.nightMenuItem(view.container, kit.NICKS[targetFor(role)], role)
  return {
    skip: skip !== null && skip.disabled === false,
    card: item !== null && item.disabled === false,
  }
}
const HAS = { skip: true, card: true }
const NONE = { skip: false, card: false }

// 내 직업 4 × (내 차례 / 남 차례): 10명, 0 나, 3 첫날 처형된 사람
const OTHER_TURN = { JOKER: "DOCTOR", DOCTOR: "GUARD", GUARD: "JOKER", WITCH_HUNTER: "JOKER" }
let panelNo = 135
for (const role of ROLES) {
  for (const mine of [true, false]) {
    const no = `A05-F-${panelNo}`
    panelNo += 1
    const turn = mine ? role : OTHER_TURN[role]
    test(`${no} 10명 ${role} 화면 ${mine ? "내" : "남"} 차례(${turn}) → 행동 칸 대상 고르기 ${mine ? "있음" : "없음"}`, () => {
      const t = kit.openNight({ n: 10, me: 0, role, dead: [3], dayIndex: dayFor(role) })
      const view = kit.mountTable()
      t.turnStarts(turn)
      assert.deepEqual(pickingUi(view, role), mine ? HAS : NONE)
    })
  }
}

test("A05-F-143 10명 시민 화면: 어느 차례에도 밤 행동 칸에 고르기 없음", () => {
  const t = kit.openNight({ n: 10, me: 0, role: "CITIZEN", dead: [3], dayIndex: 2 })
  const view = kit.mountTable()
  const seen = []
  for (const role of ROLES) {
    t.turnStarts(role)
    seen.push(pickingUi(view, role))
    t.turnEnds(role)
  }
  assert.deepEqual(seen, ROLES.map(() => NONE))
})

test("A05-F-144 6명 첫날 처형된 의사 화면: 의사 차례에도 밤 행동 칸에 고르기 없음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "DOCTOR", dead: [0] })
  const view = kit.mountTable()
  t.turnStarts("DOCTOR")
  assert.deepEqual(pickingUi(view, "DOCTOR"), NONE)
})

test("A05-F-145 6명 광대 내 차례 → \"건너뛰기\" 단추 있음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "JOKER" })
  kit.mountTable()
  t.turnStarts("JOKER")
  const button = kit.screen.getByRole("button", { name: "건너뛰기" })
  assert.equal(button.disabled, false)
})

test("A05-F-146 6명 광대 건너뛰기 누름 → 대상 null로 보냄", async () => {
  const t = kit.openNight({ n: 6, me: 0, role: "JOKER" })
  kit.mountTable()
  t.turnStarts("JOKER")
  kit.act(() => { kit.fireEvent.click(kit.screen.getByRole("button", { name: "건너뛰기" })) })
  await kit.settle()
  assert.deepEqual(t.nightSubmits(), [null])
})

// 거절 답을 받은 뒤 그려진 화면 글
async function rejectedScreenText(reply) {
  const t = kit.openNight({ n: 7, me: 0, role: "JOKER", allies: [1] })
  const view = kit.mountTable()
  t.turnStarts("JOKER")
  t.socket.setReply(reply)
  const item = kit.openNightItem(view.container, kit.NICKS[4], "JOKER")
  kit.act(() => { kit.fireEvent.click(item) })
  await kit.settle()
  assert.equal(t.nightSubmits().length, 1, "밤 행동이 안 나감 (준비 잘못)")
  return view.container.textContent
}

test("A05-F-147 동료 거절 답 → 행동 칸 안에 \"동료 광대는 고를 수 없습니다.\" 글이 그려짐", async () => {
  const text = await rejectedScreenText({ ok: false, code: "TARGET_IS_ALLY" })
  assert.match(text, /동료 광대는 고를 수 없습니다\./)
})

test("A05-F-148 그 밖 거절(글 없음) → 행동 칸 안에 \"제출하지 못했습니다.\" 글이 그려짐", async () => {
  const text = await rejectedScreenText({ ok: false, code: "NOT_YOUR_TURN" })
  assert.match(text, /제출하지 못했습니다\./)
})

// 새로고침: 빈 화면에 스냅샷(지금 차례 = 내 직업)을 넣고 그림
for (const [no, role] of [["A05-F-178", "JOKER"], ["A05-F-179", "DOCTOR"], ["A05-F-180", "GUARD"], ["A05-F-181", "WITCH_HUNTER"]]) {
  test(`${no} 10명 ${role} 화면 새로고침 뒤(스냅샷 지금 차례 = 내 직업) → 행동 칸 고르기 다시 있음`, () => {
    kit.openFromSnapshot({
      n: 10, me: 0, role, dead: [3], dayIndex: dayFor(role), nightTurnRole: role, nightTurnDeadline: Date.now() + 40_000,
    })
    const view = kit.mountTable()
    assert.deepEqual(pickingUi(view, role), HAS)
  })
}

test("A05-F-189 5명 광대 화면: 판 끝 밤 결과 뒤 행동 칸 고르기 없음", () => {
  const t = kit.openNight({ n: 5, me: 0, role: "JOKER", dead: [2, 3] })
  const view = kit.mountTable()
  t.turnStarts("JOKER")
  assert.deepEqual(pickingUi(view, "JOKER"), HAS, "광대 차례가 안 켜짐 (준비 잘못)")
  t.turnEnds("JOKER")
  t.actionsResolved()
  t.nightApplied({ victim: 4, winner: "JOKER" })
  assert.equal(t.store().state.phase, "ENDED", "판이 안 끝남 (준비 잘못)")
  assert.deepEqual(pickingUi(view, "JOKER"), NONE)
})
