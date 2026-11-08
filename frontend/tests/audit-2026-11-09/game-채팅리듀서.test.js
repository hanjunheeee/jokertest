// 6차 묶음: 낮·죽은 사람 채팅 리듀서와 조커(밤) 채팅 리듀서, 채팅 글 검사
import test from "node:test"
import assert from "node:assert/strict"

import {
  gameChatReducer,
  initialGameChatState,
  selectGameChatView,
} from "../../src/domains/game/ingame/utils/gameChatReducer.js"
import { jokerChatReducer, selectJokerChatView } from "../../src/domains/game/ingame/utils/jokerChatReducer.js"
import {
  mapJokerChatSanitizeCodeToMessage,
  sanitizeJokerChatText,
} from "../../src/domains/game/ingame/utils/chatText.js"

const G = "game-1"
const A = "auth-1"
const base = () => gameChatReducer(initialGameChatState(), { type: "CONTEXT_CHANGED", gameId: G, authUuid: A })
const act = (type, extra = {}) => ({ type, gameId: G, authUuid: A, channel: "DAY", ...extra })

test("채팅 리듀서: 처음 상태는 판·계정 없음, 낮·죽은 사람 채널이 비어 있음", () => {
  const s = initialGameChatState()
  assert.equal(s.gameId, null)
  assert.equal(s.authUuid, null)
  assert.deepEqual(s.DAY.messages, [])
  assert.deepEqual(s.DEAD.messages, [])
  assert.equal(s.DAY.generation, 0)
})

test("채팅 리듀서: 계정 없이 판만 바뀌면 판도 비움", () => {
  const s = gameChatReducer(initialGameChatState(), { type: "CONTEXT_CHANGED", gameId: G, authUuid: "" })
  assert.equal(s.gameId, null)
  assert.equal(s.authUuid, null)
})

test("채팅 리듀서: 같은 판·계정으로 다시 맞추면 상태 그대로(같은 객체)", () => {
  const s = base()
  assert.equal(gameChatReducer(s, { type: "CONTEXT_CHANGED", gameId: G, authUuid: A }), s)
})

test("채팅 리듀서: 판이 바뀌면 받은 메시지·입력이 다 비워짐", () => {
  let s = base()
  s = gameChatReducer(s, act("RECEIVE", { message: { id: "m1" } }))
  s = gameChatReducer(s, act("DRAFT", { draft: "안녕" }))
  s = gameChatReducer(s, { type: "CONTEXT_CHANGED", gameId: "game-2", authUuid: A })
  assert.equal(s.gameId, "game-2")
  assert.deepEqual(s.DAY.messages, [])
  assert.equal(s.DAY.draft, "")
})

test("채팅 리듀서: 받은 메시지는 그 채널에만 쌓임", () => {
  let s = base()
  s = gameChatReducer(s, act("RECEIVE", { message: { id: "m1" } }))
  s = gameChatReducer(s, act("RECEIVE", { channel: "DEAD", message: { id: "d1" } }))
  assert.deepEqual(s.DAY.messages.map((m) => m.id), ["m1"])
  assert.deepEqual(s.DEAD.messages.map((m) => m.id), ["d1"])
})

test("채팅 리듀서: 다른 판 메시지는 무시", () => {
  const s = base()
  assert.equal(gameChatReducer(s, act("RECEIVE", { gameId: "other", message: { id: "x" } })), s)
})

test("채팅 리듀서: 모르는 채널(직업 밤 채널) 메시지는 이 상태가 안 받음", () => {
  const s = base()
  assert.equal(gameChatReducer(s, act("RECEIVE", { channel: "JOKER", message: { id: "x" } })), s)
})

test("채팅 리듀서: 보낸 표식 없는 보내기는 무시", () => {
  const s = base()
  assert.equal(gameChatReducer(s, act("SEND", { requestToken: "" })), s)
})

test("채팅 리듀서: 보내기 성공 응답이면 보낸 글 그대로일 때 입력이 비워짐", () => {
  let s = base()
  s = gameChatReducer(s, act("DRAFT", { draft: "투표하자" }))
  s = gameChatReducer(s, act("SEND", { requestToken: "t1" }))
  assert.equal(s.DAY.status, "sending")
  s = gameChatReducer(s, act("ACK", { ok: true, generation: 0, requestToken: "t1", requestDraft: "투표하자" }))
  assert.equal(s.DAY.status, "idle")
  assert.equal(s.DAY.draft, "")
  assert.equal(s.DAY.pendingToken, null)
})

test("채팅 리듀서: 보내는 사이 입력을 고쳤으면 성공해도 고친 글을 남김", () => {
  let s = base()
  s = gameChatReducer(s, act("DRAFT", { draft: "a" }))
  s = gameChatReducer(s, act("SEND", { requestToken: "t1" }))
  s = gameChatReducer(s, act("DRAFT", { draft: "ab" }))
  s = gameChatReducer(s, act("ACK", { ok: true, generation: 0, requestToken: "t1", requestDraft: "a" }))
  assert.equal(s.DAY.draft, "ab")
})

test("채팅 리듀서: 실패 응답은 문구를 보이고 입력은 둠", () => {
  let s = base()
  s = gameChatReducer(s, act("DRAFT", { draft: "글" }))
  s = gameChatReducer(s, act("SEND", { requestToken: "t1" }))
  s = gameChatReducer(s, act("ACK", { ok: false, message: "보낼 수 없음", generation: 0, requestToken: "t1" }))
  assert.equal(s.DAY.error, "보낼 수 없음")
  assert.equal(s.DAY.draft, "글")
  assert.equal(s.DAY.status, "idle")
})

test("채팅 리듀서: 끊김(무효화) 뒤 늦게 온 응답은 버림", () => {
  let s = base()
  s = gameChatReducer(s, act("DRAFT", { draft: "글" }))
  s = gameChatReducer(s, act("SEND", { requestToken: "t1" }))
  s = gameChatReducer(s, { type: "INVALIDATE" })
  assert.equal(s.DAY.generation, 1)
  assert.equal(s.DEAD.generation, 1)
  const after = gameChatReducer(s, act("ACK", { ok: true, generation: 0, requestToken: "t1", requestDraft: "글" }))
  assert.equal(after, s)
  assert.equal(after.DAY.draft, "글")
})

test("채팅 리듀서: 다른 보내기 표식의 응답은 버림", () => {
  let s = base()
  s = gameChatReducer(s, act("SEND", { requestToken: "t2" }))
  assert.equal(gameChatReducer(s, act("ACK", { ok: true, generation: 0, requestToken: "t1", requestDraft: "" })), s)
})

test("채팅 리듀서: 무효화는 메시지·입력을 남기고 보내는 중만 풂", () => {
  let s = base()
  s = gameChatReducer(s, act("RECEIVE", { message: { id: "m1" } }))
  s = gameChatReducer(s, act("DRAFT", { draft: "x" }))
  s = gameChatReducer(s, act("SEND", { requestToken: "t1" }))
  s = gameChatReducer(s, { type: "INVALIDATE" })
  assert.equal(s.DAY.status, "idle")
  assert.equal(s.DAY.pendingToken, null)
  assert.equal(s.DAY.draft, "x")
  assert.equal(s.DAY.messages.length, 1)
})

test("채팅 화면 값: 다른 계정이면 빈 화면(보내기 막힘 표시 generation null)", () => {
  let s = base()
  s = gameChatReducer(s, act("RECEIVE", { message: { id: "m1" } }))
  const v = selectGameChatView(s, G, "auth-2", "DAY")
  assert.deepEqual(v.messages, [])
  assert.equal(v.generation, null)
})

test("채팅 화면 값: 다른 판이거나 볼 채널이 없으면 빈 화면", () => {
  const s = base()
  assert.equal(selectGameChatView(s, "game-2", A, "DAY").generation, null)
  assert.equal(selectGameChatView(s, G, A, null).generation, null)
})

test("채팅 화면 값: 지금 판·계정·채널이면 그 채널 값", () => {
  let s = base()
  s = gameChatReducer(s, act("RECEIVE", { channel: "DEAD", message: { id: "d1" } }))
  const v = selectGameChatView(s, G, A, "DEAD")
  assert.deepEqual(v.messages, [{ id: "d1" }])
  assert.equal(v.generation, 0)
})

test("조커 채팅: 다른 판 메시지를 받으면 그 판으로 새로 시작", () => {
  let s = { gameId: G, messages: [{ id: "old" }], draft: "x", status: "idle", error: null }
  s = jokerChatReducer(s, { type: "RECEIVE", gameId: "game-2", message: { id: "new" } })
  assert.equal(s.gameId, "game-2")
  assert.deepEqual(s.messages, [{ id: "new" }])
  assert.equal(s.draft, "")
})

test("조커 채팅: 다른 판 입력·보내기는 무시", () => {
  const s = { gameId: G, messages: [], draft: "", status: "idle", error: null }
  assert.equal(jokerChatReducer(s, { type: "DRAFT", gameId: "x", draft: "a" }), s)
  assert.equal(jokerChatReducer(s, { type: "SEND", gameId: "x" }), s)
})

test("조커 채팅: 성공 응답이면 보낸 글 그대로일 때만 입력 비움", () => {
  const s = { gameId: G, messages: [], draft: "밤", status: "sending", error: null }
  assert.equal(jokerChatReducer(s, { type: "ACK", gameId: G, ok: true, requestDraft: "밤" }).draft, "")
  assert.equal(jokerChatReducer(s, { type: "ACK", gameId: G, ok: true, requestDraft: "다른" }).draft, "밤")
})

test("조커 채팅: 실패 응답은 문구를 남김", () => {
  const s = { gameId: G, messages: [], draft: "밤", status: "sending", error: null }
  const n = jokerChatReducer(s, { type: "ACK", gameId: G, ok: false, message: "실패" })
  assert.equal(n.status, "idle")
  assert.equal(n.error, "실패")
  assert.equal(n.draft, "밤")
})

test("조커 채팅: 무효화는 보내는 중일 때만 풂", () => {
  const idle = { gameId: G, messages: [], draft: "", status: "idle", error: "e" }
  assert.equal(jokerChatReducer(idle, { type: "INVALIDATE", gameId: G }), idle)
  const sending = { ...idle, status: "sending" }
  assert.equal(jokerChatReducer(sending, { type: "INVALIDATE", gameId: G }).status, "idle")
})

test("조커 채팅 화면 값: 다른 판 상태면 빈 화면", () => {
  const s = { gameId: G, messages: [{ id: "m" }], draft: "d", status: "idle", error: null }
  assert.deepEqual(selectJokerChatView(s, "game-2"), { draft: "", messages: [], status: "idle", error: null })
  assert.deepEqual(selectJokerChatView(s, G).messages, [{ id: "m" }])
})

test("채팅 글 검사: 앞뒤 공백을 빼고 CRLF를 줄바꿈 하나로 맞춤", () => {
  assert.deepEqual(sanitizeJokerChatText("  가\r\n나  "), { ok: true, text: "가\n나" })
})

test("채팅 글 검사: 공백만이면 빈 글", () => {
  assert.deepEqual(sanitizeJokerChatText("   \n "), { ok: false, code: "EMPTY_MESSAGE" })
})

test("채팅 글 검사: 150자는 통과, 151자는 너무 김", () => {
  assert.equal(sanitizeJokerChatText("가".repeat(150)).ok, true)
  assert.deepEqual(sanitizeJokerChatText("가".repeat(151)), { ok: false, code: "MESSAGE_TOO_LONG" })
})

test("채팅 글 검사: 탭·글 방향 바꾸는 숨은 문자는 막음", () => {
  assert.equal(sanitizeJokerChatText("a\tb").code, "INVALID_CHARACTERS")
  assert.equal(sanitizeJokerChatText("a‮b").code, "INVALID_CHARACTERS")
  assert.equal(sanitizeJokerChatText("a‏b").code, "INVALID_CHARACTERS")
})

test("채팅 글 검사 문구: 코드별 문구와 모르는 코드 기본 문구", () => {
  assert.equal(mapJokerChatSanitizeCodeToMessage("EMPTY_MESSAGE"), "메시지를 입력해주세요.")
  assert.equal(mapJokerChatSanitizeCodeToMessage("MESSAGE_TOO_LONG"), "메시지는 150자 이하로 입력해주세요.")
  assert.equal(mapJokerChatSanitizeCodeToMessage("WHAT"), "메시지를 보낼 수 없습니다.")
})
