// 판 중 채팅 세션 값 시험 — 받은 채팅이 목록에 붙는 법, 보내기 답·끊김·판 바뀜, 새로고침 기억
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-047~063, A06-F-076~080 (채팅 칸이 받는 값을 엿봐 확인)
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, flush, goOffline, useInGameStore } from "./a06Kit.mjs"

const { loadChatHistory, saveChatHistory } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")

test.afterEach(resetTable)

// 채팅 칸이 받는 목록을 "닉네임:글" 글자로만
const lines = (t) => t.sink.chat.messages.map((m) => `${m.senderName}:${m.text}`)
// 입력 글 넣기·보내기 (채팅 칸이 부르는 손잡이 그대로)
async function setDraft(t, text) {
  await RTL.act(async () => { t.sink.chat.onDraftChange(text) })
  await flush()
}
async function send(t) {
  await RTL.act(async () => { t.sink.chat.onSend() })
  await flush()
}
const chatEvents = (t) => t.sentOf("submit_game_chat_message").length + t.sentOf("submit_joker_chat_message").length

test("A06-F-047 낮 채팅 받음(5명 판) → 낮 목록 끝에 그 줄", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  await t.dayChat(1, "첫 말")
  await t.dayChat(2, "안녕")
  assert.deepEqual(lines(t), [`${t.nick(1)}:첫 말`, `${t.nick(2)}:안녕`])
})

test("A06-F-048 같은 글 id 두 번 받음 → 한 줄 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  await t.dayChat(1, "안녕", { id: "same-1" })
  await t.dayChat(1, "안녕", { id: "same-1" })
  assert.deepEqual(lines(t), [`${t.nick(1)}:안녕`])
})

test("A06-F-049 다른 판 id 알림 → 목록 그대로 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  await t.dayChat(1, "남의 판 말", { gameId: "other-game" })
  assert.deepEqual(lines(t), [])
})

test("A06-F-050 죽은 사람 글(나 죽음, 7명 판) → 채널 DEAD 줄", async () => {
  const t = await openTable({ n: 7, me: 3, dead: [3, 4], view: "probe" })
  await t.deadChat(4, "죽은 말")
  const rows = t.sink.chat.messages.map((m) => `${m.channel}:${m.text}`)
  assert.deepEqual(rows, ["DEAD:죽은 말"])
})

test("A06-F-051 의사가 같은 직업 밤 채팅 받음(6명 판 의사 2) → 밤 목록에 줄", async () => {
  const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER", 2: "DOCTOR" }, phase: "NIGHT", view: "probe" })
  await t.roleChat(2, "누구 지킬까")
  assert.deepEqual(lines(t), [`${t.nick(2)}:누구 지킬까`])
})

test("A06-F-052 밤 의사 줄 2개 뒤 낮 시작 → 보이는 목록은 낮 말만", async () => {
  const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER", 2: "DOCTOR" }, phase: "NIGHT", view: "probe" })
  await t.roleChat(2, "밤말1")
  await t.roleChat(1, "밤말2")
  await t.nextDay()
  await t.dayChat(3, "낮말")
  assert.deepEqual(lines(t), [`${t.nick(3)}:낮말`])
})

test("A06-F-053 죽은 사람 목록 = 낮 말 + 죽은 사람 말, 엇갈린 시각이면 시각 순(7명 판)", async () => {
  const t = await openTable({ n: 7, me: 3, dead: [3, 4], view: "probe" })
  await t.dayChat(1, "낮A", { sentAt: 2_000 })
  await t.deadChat(4, "죽B", { sentAt: 1_000 })
  await t.deadChat(4, "죽C", { sentAt: 4_000 })
  await t.dayChat(2, "낮D", { sentAt: 3_000 })
  assert.deepEqual(t.sink.chat.messages.map((m) => m.text), ["죽B", "낮A", "낮D", "죽C"])
})

test("A06-F-054 죽은 광대 밤 목록 = 광대 말 + 죽은 사람 말(7명 판 광대 2)", async () => {
  const t = await openTable({ n: 7, me: 1, myRole: "JOKER", roles: { 0: "JOKER" }, dead: [1, 4], phase: "NIGHT", view: "probe" })
  await t.roleChat(0, "광대말", { sentAt: 1_000 })
  await t.deadChat(4, "죽은말", { sentAt: 2_000 })
  assert.deepEqual(t.sink.chat.messages.map((m) => m.text), ["광대말", "죽은말"])
})

test("A06-F-055 서버 거절 답 글 → 그 채널 오류 = 그 글 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe", acks: { submit_game_chat_message: "hold" } })
  await setDraft(t, "안녕")
  await send(t)
  await t.answer("submit_game_chat_message", { ok: false, code: "RATE_LIMITED", message: "요청을 처리할 수 없습니다." })
  assert.equal(t.sink.chat.error, "요청을 처리할 수 없습니다.")
})

test("A06-F-056 답이 안 옴(시간 초과) → \"요청이 응답하지 않습니다. 다시 시도해주세요.\"", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe", acks: { submit_game_chat_message: "hold" } })
  await setDraft(t, "안녕")
  await send(t)
  await t.timeoutAck("submit_game_chat_message")
  assert.equal(t.sink.chat.error, "요청이 응답하지 않습니다. 다시 시도해주세요.")
})

test("A06-F-057 인터넷 끊김 → 보내기 0번, 끊김 문구", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  goOffline()
  await setDraft(t, "안녕")
  await send(t)
  assert.equal(chatEvents(t), 0)
  assert.equal(t.sink.chat.error, "인터넷 연결이 끊겨 보내지 못했습니다. 연결되면 다시 보내 주세요.")
})

test("A06-F-058 보내기 성공 답 → 그 채널 입력 글 비움 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  await setDraft(t, "안녕")
  await send(t)
  assert.equal(t.sentOf("submit_game_chat_message").length, 1)
  assert.equal(t.sink.chat.draft, "")
})

test("A06-F-059 답 오기 전 두 번 보내기 → submit_game_chat_message 1번 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe", acks: { submit_game_chat_message: "hold" } })
  await setDraft(t, "안녕")
  await send(t)
  await send(t)
  assert.equal(t.sentOf("submit_game_chat_message").length, 1)
})

test("A06-F-060 보낸 뒤 새 판 시작, 그다음 옛 답 → 새 판 오류 없음·입력 그대로 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe", acks: { submit_game_chat_message: "hold" } })
  await setDraft(t, "옛 판 글")
  await send(t)
  await t.newGame()
  await setDraft(t, "새 판 글")
  await t.answer("submit_game_chat_message", { ok: false, code: "RATE_LIMITED", message: "옛 판 오류" })
  assert.equal(t.sink.chat.error, null)
  assert.equal(t.sink.chat.draft, "새 판 글")
})

// 저장 모양 말 하나
const stored = (i, sender = "s1") => ({ id: `m${i}`, senderUuid: sender, text: `말${i}`, sentAt: 1_000 + i })

test("A06-F-061 새로고침 기억은 판·채널마다 최근 200줄: 201줄 저장 → 200줄, 첫 줄 없음", () => {
  const all = Array.from({ length: 201 }, (_, i) => stored(i))
  saveChatHistory("game", "g-201", "me-201", { DAY: all })
  const restored = loadChatHistory("game", "g-201", "me-201")
  assert.equal(restored.DAY.length, 200)
  assert.equal(restored.DAY.some((m) => m.id === "m0"), false)
  assert.equal(restored.DAY.at(-1).id, "m200")
})

test("A06-F-062 새 판이 오면 옛 판 기억 덮음: 판 1 저장 뒤 판 2 저장 → 판 1 줄 없음", () => {
  saveChatHistory("game", "g-one", "me-x", { DAY: [stored(1)] })
  saveChatHistory("game", "g-two", "me-x", { DAY: [stored(2)] })
  assert.equal(loadChatHistory("game", "g-one", "me-x"), null)
  assert.deepEqual(loadChatHistory("game", "g-two", "me-x").DAY.map((m) => m.id), ["m2"])
})

test("A06-F-063 새로고침 뒤 기억한 낮 채팅 다시 읽음: 저장 3줄 + 같은 판 스냅샷 → 낮 목록 3줄", async () => {
  const t = await openTable({ n: 5, me: 0, view: "none" })
  saveChatHistory("game", t.gameId, t.me, {
    DAY: [1, 2, 3].map((i) => ({ id: `r${i}`, senderUuid: t.uuid(i), text: `기억${i}`, sentAt: 1_000 + i })),
  })
  // 새로고침: 화면 판 값이 비고 스냅샷으로 다시 채움
  const snapshot = t.snapshot()
  await RTL.act(async () => {
    useInGameStore.getState().clearGame()
    useInGameStore.getState().bootstrapSessionSnapshot(snapshot, null)
  })
  assert.equal(useInGameStore.getState().gameId, t.gameId, "스냅샷을 스토어가 안 받음")
  RTL.cleanup()
  await t.mount("probe")
  assert.deepEqual(t.sink.chat.messages.map((m) => m.text), ["기억1", "기억2", "기억3"])
})

test("A06-F-076 새 판 시작 알림 → 채팅 목록 비움 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  await t.dayChat(1, "옛 판 말")
  assert.equal(t.sink.chat.messages.length, 1)
  await t.newGame()
  assert.deepEqual(lines(t), [])
})

test("A06-F-077 가려진 글 \"너 **야\" 받음 → 목록 글 그대로 \"너 **야\"", async () => {
  const t = await openTable({ n: 5, me: 0, view: "probe" })
  await t.dayChat(1, "너 **야")
  assert.deepEqual(t.sink.chat.messages.map((m) => m.text), ["너 **야"])
})

test("A06-F-078 결과 화면(ENDED)에서 보내기 → 사건 0번 [지금 동작]", async () => {
  const t = await openTable({ n: 5, me: 0, phase: "ENDED", view: "probe" })
  await setDraft(t, "끝났다")
  await send(t)
  assert.equal(chatEvents(t), 0)
})

test("A06-F-079 역할 확인 중 보내기 → 사건 0번", async () => {
  const t = await openTable({ n: 5, me: 0, phase: "ROLE_REVEAL", view: "probe" })
  await setDraft(t, "벌써")
  await send(t)
  assert.equal(chatEvents(t), 0)
})

test("A06-F-080 [단위 2] 밤 산 시민 보내기 → 같은 직업·낮 채팅 사건 둘 다 0번", async () => {
  const t = await openTable({ n: 5, me: 1, roles: { 0: "JOKER" }, phase: "NIGHT", view: "probe" })
  await setDraft(t, "시민끼리")
  await send(t)
  assert.equal(t.sentOf("submit_joker_chat_message").length, 0)
  assert.equal(t.sentOf("submit_game_chat_message").length, 0)
})
