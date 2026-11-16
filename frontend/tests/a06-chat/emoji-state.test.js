// 판 중 이모티콘 상태 시험 — 말풍선 3초, 같은 사람 다시 보냄, 보낼 수 있는 범위, 거절·판 바뀜 때 말풍선
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-064~071
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, flush, startFakeClock, tick, useInGameStore, useInGameEmojiBubbleStore, EMOJI } from "./a06Kit.mjs"

const { selectInGameEmojiScope } = await import("../../src/domains/game/ingame/utils/selectInGameEmojiScope.js")

test.afterEach(resetTable)

// 그 사람 말풍선에 뜬 이모티콘 id (없으면 null)
const bubbleOf = (t, i) => useInGameEmojiBubbleStore.getState().byUuid[t.uuid(i)]?.itemId ?? null
// 지금 스토어 판 값으로 이모티콘 범위가 있는지
const hasScope = (t) => selectInGameEmojiScope(useInGameStore.getState(), t.me, null) !== null
// 팔레트가 부르는 보내기 그대로 (답까지 기다림)
async function sendEmoji(t, itemId) {
  let result
  await RTL.act(async () => { result = await t.sink.emoji.send(itemId) })
  await flush()
  return result
}

test("A06-F-064 emoji_shown → 그 사람 말풍선 있음, 2.9초 있음, 3초 없음 [지금 동작]", async () => {
  startFakeClock()
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  await t.emojiShown(2, EMOJI.love)
  assert.equal(bubbleOf(t, 2), EMOJI.love)
  await tick(2_900)
  assert.equal(bubbleOf(t, 2), EMOJI.love)
  await tick(100)
  assert.equal(bubbleOf(t, 2), null)
})

test("A06-F-065 같은 사람이 0초 A, 2초 B → 4.9초까지 B, 5초 없음 [지금 동작]", async () => {
  startFakeClock()
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  await t.emojiShown(3, EMOJI.love)
  await tick(2_000)
  await t.emojiShown(3, EMOJI.hello)
  assert.equal(bubbleOf(t, 3), EMOJI.hello)
  await tick(2_900)
  assert.equal(bubbleOf(t, 3), EMOJI.hello)
  await tick(100)
  assert.equal(bubbleOf(t, 3), null)
})

test("A06-F-066 결과 화면(ENDED) → 이모티콘 범위 없음(못 보냄)", async () => {
  const t = await openTable({ n: 5, me: 0, phase: "ENDED", view: "none" })
  assert.equal(hasScope(t), false)
})

test("A06-F-067 판에서 빠짐(내 줄 참여 끝) → 범위 없음 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 2, left: [2], view: "none" })
  assert.equal(hasScope(t), false)
})

test("A06-F-068 역할 확인 중 → 범위 있음(보냄 됨)", async () => {
  const t = await openTable({ n: 5, me: 0, phase: "ROLE_REVEAL", view: "none" })
  assert.equal(hasScope(t), true)
})

test("A06-F-069 죽은 나(7명 판)가 보냄 → 서버 거절 PLAYER_NOT_ALIVE, 내 말풍선 없음", async () => {
  const t = await openTable({
    n: 7, me: 4, dead: [4], view: "probe",
    acks: { send_emoji: { ok: false, code: "PLAYER_NOT_ALIVE", message: "요청을 처리할 수 없습니다." } },
  })
  const result = await sendEmoji(t, EMOJI.love)
  assert.equal(t.sentOf("send_emoji").length, 1)
  assert.equal(result.ok, false)
  assert.equal(result.code, "PLAYER_NOT_ALIVE")
  assert.equal(bubbleOf(t, 4), null)
})

test("A06-F-070 이모티콘 간격 거절 RATE_LIMITED → 실패 결과, 말풍선 없음 [지금 동작]", async () => {
  const t = await openTable({
    n: 5, me: 0, view: "probe",
    acks: { send_emoji: { ok: false, code: "RATE_LIMITED", message: "요청을 처리할 수 없습니다." } },
  })
  const result = await sendEmoji(t, EMOJI.love)
  assert.equal(result.ok, false)
  assert.equal(result.code, "RATE_LIMITED")
  assert.equal(bubbleOf(t, 0), null)
})

test("A06-F-071 보낸 뒤 새 판 시작, 그다음 옛 답 → 옛 답 버림 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe", acks: { send_emoji: "hold" } })
  let result = null
  let pending
  await RTL.act(async () => { pending = t.sink.emoji.send(EMOJI.love).then((r) => { result = r }) })
  await t.newGame()
  await t.answer("send_emoji", { ok: true, sentAt: Date.now() })
  await pending
  assert.equal(result.ok, false)
  assert.equal(result.stale, true)
})
