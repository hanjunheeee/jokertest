// 낮 투표 고르기(카드 메뉴 "투표하기"·기권 단추·보내는 값·키보드) 화면 부품 시험 — 인게임 화면을 그려 눌러 봄
// 목록 A03-낮투표.md 번호 A03-F-166~204 (F-201·202는 정한 글 없어 지금 동작을 임시 정답으로 씀)
import test from "node:test"
import assert from "node:assert/strict"
import {
  GAME, abstainButton, cardOf, click, deferred, fakeSocket, fire, isTabReachable, menuItems, pressEnter,
  readCardMenu, renderPage, resetAll, seat, settle, uuidOf, voteVia,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// 단계마다 판 차리기 (재판 피고는 3번)
const PHASES = {
  토론: { phase: "DAY", dayPhase: "DAY_DISCUSSION" },
  투표: { phase: "DAY", dayPhase: "DAY_VOTE" },
  "5초 중": { phase: "DAY", dayPhase: "DAY_VOTE", pulled: true },
  재판: { phase: "TRIBUNAL", state: { tribunal: { defendantUuid: uuidOf(3), resolved: false } } },
  밤: { phase: "NIGHT" },
}
async function phasePage(phaseName, { n = 6, acks = {}, ...seatOptions } = {}) {
  const { pulled, ...phaseOptions } = PHASES[phaseName]
  const socket = fakeSocket({ acks })
  seat({ n, ...phaseOptions, ...seatOptions })
  await renderPage(socket)
  if (pulled) await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000 }))
  return socket
}
const canVote = (items) => items.some((item) => item.name === "투표하기" && item.enabled)

// A03-F-166~171 인원 5~10 (2번 죽음) → 고를 수 있는 카드 = 나 빼고 산 사람 수
;[5, 6, 7, 8, 9, 10].forEach((n, i) => {
  test(`A03-F-${166 + i} ${n}명 판(1명 죽음) → 투표 고를 수 있는 카드 ${n - 2}장`, async () => {
    await phasePage("투표", { n, dead: [2] })
    let count = 0
    for (let index = 0; index < n; index += 1) {
      if (canVote(await readCardMenu(index))) count += 1
    }
    assert.equal(count, n - 2)
  })
})

// A03-F-172~186 단계 × 대상 → 투표·5초 중의 산 다른 사람에게만 "투표하기"
const TARGETS = [["산 다른 사람", 2], ["나", 0], ["죽은 사람", 4]]
let pickNo = 172
for (const phaseName of Object.keys(PHASES)) {
  for (const [targetName, index] of TARGETS) {
    const id = `A03-F-${pickNo}`
    pickNo += 1
    const expected = (phaseName === "투표" || phaseName === "5초 중") && targetName === "산 다른 사람"
    test(`${id} ${phaseName} · ${targetName} 카드 → 누를 수 있는 '투표하기' ${expected ? "있음" : "없음"}`, async () => {
      await phasePage(phaseName, { dead: [4] })
      assert.equal(canVote(await readCardMenu(index)), expected)
    })
  }
}

// A03-F-187~196 단계 × (산·죽은) → 투표·5초 중의 산 사람에게만 기권 켜짐
let abstainNo = 187
for (const phaseName of Object.keys(PHASES)) {
  for (const alive of [true, false]) {
    const id = `A03-F-${abstainNo}`
    abstainNo += 1
    const expected = (phaseName === "투표" || phaseName === "5초 중") && alive
    test(`${id} ${phaseName} · ${alive ? "산" : "죽은"} 나 → 기권 단추 ${expected ? "켜짐" : "꺼짐/없음"}`, async () => {
      await phasePage(phaseName, { dead: alive ? [] : [0] })
      const button = abstainButton()
      assert.equal(button !== null && button.disabled === false, expected)
    })
  }
}

// A03-F-197~204 표 보내기
test("A03-F-197 ① 기권 → targetId null 보냄", async () => {
  const socket = await phasePage("투표")
  await click(abstainButton())
  assert.deepEqual(socket.sentOf("cast_day_vote"), [{ gameId: GAME, dayIndex: 1, targetId: null }])
})

test("A03-F-198 ② 사람 → 그 uuid 보냄", async () => {
  const socket = await phasePage("투표")
  await voteVia(3)
  assert.deepEqual(socket.sentOf("cast_day_vote"), [{ gameId: GAME, dayIndex: 1, targetId: uuidOf(3) }])
})

test("A03-F-199 ③ 낸 뒤 다른 사람 → 다시 보냄", async () => {
  const socket = await phasePage("투표")
  await voteVia(3)
  assert.equal(await voteVia(5), true)
  assert.deepEqual(socket.sentOf("cast_day_vote").map((p) => p.targetId), [uuidOf(3), uuidOf(5)])
})

test("A03-F-200 ④ 5초 중 다른 사람 → 보냄", async () => {
  const socket = await phasePage("투표")
  await voteVia(3)
  await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000 }))
  assert.equal(await voteVia(1), true)
  assert.equal(socket.sentOf("cast_day_vote").at(-1).targetId, uuidOf(1))
})

test("A03-F-201 ⑤ 실패 글이 행동 칸에 보임 [지금 동작]", async () => {
  const message = "대상이 살아 있지 않습니다."
  const socket = await phasePage("투표", { acks: { cast_day_vote: { ok: false, code: "TARGET_NOT_ALIVE", message } } })
  assert.equal(await voteVia(3), true)
  assert.equal(socket.sentOf("cast_day_vote").length, 1, "표는 보냄")
  assert.equal(document.body.textContent.includes(message), true, "거절 글이 화면 어디에도 없음")
})

test("A03-F-202 ⑥ 보내는 중 두 번 눌러도 한 번만 보냄 [지금 동작]", async () => {
  const ack = deferred()
  const socket = await phasePage("투표", { acks: { cast_day_vote: () => ack.promise } })
  await voteVia(3)
  await voteVia(4)
  await click(abstainButton())
  assert.equal(socket.sentOf("cast_day_vote").length, 1)
  ack.resolve({ ok: true })
})

test("A03-F-203 ⑦ 키보드(Tab·Enter)로 기권과 표", async () => {
  const socket = await phasePage("투표")
  assert.equal(isTabReachable(abstainButton()), true)
  await pressEnter(abstainButton())
  assert.equal(isTabReachable(cardOf(2)), true)
  await pressEnter(cardOf(2))
  const item = menuItems().find((entry) => entry.name === "투표하기")
  assert.equal(isTabReachable(item?.el), true)
  await pressEnter(item.el)
  assert.deepEqual(socket.sentOf("cast_day_vote").map((p) => p.targetId), [null, uuidOf(2)])
})

test("A03-F-204 ⑧ 나는 광대, 동료 광대 고름 → 보냄", async () => {
  const socket = await phasePage("투표", { n: 7, role: "JOKER", allies: [3] })
  assert.equal(await voteVia(3), true)
  assert.equal(socket.sentOf("cast_day_vote").at(-1).targetId, uuidOf(3))
})
