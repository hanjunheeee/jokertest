// 채팅 입력칸 시험(jsdom) — 보내기 전 글 검사 문구, Shift+Enter·한글 조합 중 Enter, 보내기 단추, 서버 거절·시간 초과·끊김 글, 채널마다 오류, 결과 화면·역할 확인, 접근성
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-131~147
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, goOffline } from "./a06Kit.mjs"

test.afterEach(resetTable)

const TOO_LONG = "메시지는 150자 이하로 입력해주세요."
const EMPTY = "메시지를 입력해주세요."
const BAD_CHAR = "사용할 수 없는 문자가 포함되어 있습니다."
const gameSent = (t) => t.sentOf("submit_game_chat_message")
const chatEvents = (t) => gameSent(t).length + t.sentOf("submit_joker_chat_message").length

// 6명 낮 판(인게임 화면 전체), 나 = 1번 산 시민
const dayTable = (options = {}) =>
  openTable({ n: 6, me: 1, roles: { 0: "JOKER", 5: "DOCTOR" }, phase: "DAY", view: "page", ...options })

const CHECKS = [
  ["A06-F-131", "151자", "a".repeat(151), TOO_LONG],
  ["A06-F-132", "150자", "b".repeat(150), null],
  ["A06-F-133", "빈 엔터", "", EMPTY],
  ["A06-F-134", "공백만", "    ", EMPTY],
  ["A06-F-135", "한글 151자", "한".repeat(151), TOO_LONG],
  ["A06-F-136", "글 방향 바꿈 글자(U+202E) 든 글", "안녕‮요", BAD_CHAR],
]
for (const [id, label, text, message] of CHECKS) {
  const expectText = message === null ? "사건 1번·글 그대로" : `"${message}"·사건 0`
  test(`${id} 보내기 전 글 검사(입력칸 아래 상태 줄): ${label} → ${expectText}`, async () => {
    const t = await dayTable()
    if (text.length > 0) await t.type(text)
    await t.enter()
    if (message === null) {
      assert.deepEqual(gameSent(t), [{ gameId: t.gameId, text }])
      assert.equal(t.statusText("board"), null)
    } else {
      assert.equal(t.statusText("board"), message)
      assert.equal(chatEvents(t), 0)
    }
  })
}

test("A06-F-137 Shift+Enter는 줄바꿈: 사건 0, 입력 글에 줄바꿈 [지금 동작]", async () => {
  const t = await dayTable()
  await t.type("윗줄")
  // 키 기본 동작을 안 막아야 브라우저가 줄을 바꿈 (jsdom은 글을 안 넣어서 바뀐 글은 손으로 넣음)
  const notCancelled = await t.enter(undefined, { shiftKey: true })
  assert.equal(notCancelled, true)
  await t.type("윗줄\n아랫줄")
  assert.equal(t.input().value, "윗줄\n아랫줄")
  assert.equal(chatEvents(t), 0)
})

test("A06-F-138 한글 조합 중(isComposing) Enter → 사건 0 [지금 동작]", async () => {
  const t = await dayTable()
  await t.type("안녕하")
  await t.enter(undefined, { isComposing: true })
  assert.equal(chatEvents(t), 0)
})

test("A06-F-139 글 치고 보내기 단추 누름 → 사건 1번 [지금 동작]", async () => {
  const t = await dayTable()
  await t.type("단추로")
  await t.click(t.sendButton("board"))
  assert.deepEqual(gameSent(t), [{ gameId: t.gameId, text: "단추로" }])
})

test("A06-F-140 답 ok:false + 글 → 상태 줄에 그 글 [지금 동작]", async () => {
  const t = await dayTable({ acks: { submit_game_chat_message: "hold" } })
  await t.type("안녕")
  await t.enter()
  await t.answer("submit_game_chat_message", { ok: false, code: "RATE_LIMITED", message: "요청을 처리할 수 없습니다." })
  assert.equal(t.statusText("board"), "요청을 처리할 수 없습니다.")
})

test("A06-F-141 답이 안 옴(시간 초과) → \"요청이 응답하지 않습니다. 다시 시도해주세요.\" 보임", async () => {
  const t = await dayTable({ acks: { submit_game_chat_message: "hold" } })
  await t.type("안녕")
  await t.enter()
  await t.timeoutAck("submit_game_chat_message")
  assert.equal(t.statusText("board"), "요청이 응답하지 않습니다. 다시 시도해주세요.")
})

test("A06-F-142 인터넷 끊김에서 Enter → 끊김 문구 보임, 사건 0", async () => {
  const t = await dayTable()
  goOffline()
  await t.type("안녕")
  await t.enter()
  assert.equal(t.statusText("board"), "인터넷 연결이 끊겨 보내지 못했습니다. 연결되면 다시 보내 주세요.")
  assert.equal(chatEvents(t), 0)
})

test("A06-F-143 오류 글은 채널마다: 낮 오류 글 뒤 밤(의사) → 밤 칸엔 그 오류 없음 [지금 동작]", async () => {
  const t = await dayTable({ me: 5, myRole: "DOCTOR", roles: { 0: "JOKER" } })
  await t.type("a".repeat(151))
  await t.enter()
  assert.equal(t.statusText("board"), TOO_LONG)
  await t.toNight()
  assert.ok(t.input("board") !== null, "밤 의사 입력칸이 없음")
  assert.equal(t.statusText("board"), null)
})

test("A06-F-144 결과 화면(ENDED) 칸에서 Enter → 사건 0 [지금 동작]", async () => {
  const t = await dayTable({ phase: "ENDED", view: "chat" })
  if (t.input()) {
    await t.type("끝났네")
    await t.enter()
  }
  assert.equal(chatEvents(t), 0)
})

test("A06-F-145 역할 확인 중 입력칸 모양: 입력칸 있음·안내 글 없음 [지금 동작]", async () => {
  const t = await dayTable({ phase: "ROLE_REVEAL" })
  assert.ok(t.input("board") !== null, "입력칸이 없음")
  assert.equal(t.closedText("board") === null, true)
})

test("A06-F-146 입력칸에 화면 읽기 이름이 있음 (접근성)", async () => {
  const t = await dayTable()
  const label = t.input("board")?.getAttribute("aria-label") ?? ""
  assert.ok(label.trim().length > 0, "입력칸 이름 없음")
})

test("A06-F-147 키보드만으로 보냄 (접근성): Tab으로 입력칸 → 글 → Enter → 사건 1번", async () => {
  const t = await dayTable()
  const input = t.input("board")
  // Tab으로 닿는지: 꺼지지 않았고 잠긴 덮개 밖이고 Tab 순서 안
  assert.equal(input.disabled, false)
  assert.equal(input.closest("[inert]") === null, true)
  assert.ok(input.tabIndex >= 0)
  input.focus()
  assert.equal(document.activeElement === input, true)
  await t.type("키보드로")
  await t.enter()
  assert.deepEqual(gameSent(t), [{ gameId: t.gameId, text: "키보드로" }])
})
