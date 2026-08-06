import test from "node:test"
import assert from "node:assert/strict"
import { gameChatReducer, initialGameChatState, selectGameChatView } from "../gameChatReducer.js"

const GAME = "game-1"
const ACCOUNT_A = "account-a"
const ACCOUNT_B = "account-b"

/** 지금 소유자(gameId + 인증 계정)를 확정한 상태에서 시작한다. */
function seeded(gameId = GAME, authUuid = ACCOUNT_A) {
  return gameChatReducer(initialGameChatState(), { type: "CONTEXT_CHANGED", gameId, authUuid })
}

/** 액션마다 소유자를 일일이 적지 않도록 기본 신원을 채워 넣는다(명시하면 그 값이 이긴다). */
function apply(state, action) {
  return gameChatReducer(state, { gameId: GAME, authUuid: ACCOUNT_A, ...action })
}

function message(id, text = "hi") {
  return { id, senderUuid: "u1", text, sentAt: 1000 }
}

const EMPTY_CHANNEL = { messages: [], draft: "", status: "idle", error: null, generation: 0, pendingToken: null }
const MASKED = { draft: "", messages: [], status: "idle", error: null, generation: null }

/** SEND → ACK 한 왕복을 그대로 재현한다(제출 시점의 세대·토큰을 캡처해 응답에 되돌려준다). */
function sendThenAck(state, { channel, requestToken, ok, message: msg, requestDraft, authUuid = ACCOUNT_A }) {
  const generation = state[channel].generation
  const sent = apply(state, { type: "SEND", authUuid, channel, requestToken })
  return apply(sent, {
    type: "ACK",
    authUuid,
    channel,
    generation,
    requestToken,
    ok,
    message: msg,
    requestDraft,
  })
}

test("gameChatReducer: RECEIVE는 해당 채널에만 append하고 다른 채널은 참조까지 그대로 둔다", () => {
  const state = seeded()
  const next = apply(state, { type: "RECEIVE", channel: "DAY", message: message("m1") })

  assert.deepEqual(next.DAY.messages, [message("m1")])
  assert.deepEqual(next.DEAD.messages, [])
  assert.equal(next.DEAD, state.DEAD)
})

test("gameChatReducer: 두 채널의 draft는 서로 독립적이다(한쪽 입력이 다른 쪽을 덮어쓰지 않는다)", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "낮 초안" })
  state = apply(state, { type: "DRAFT", channel: "DEAD", draft: "사망자 초안" })

  assert.equal(state.DAY.draft, "낮 초안")
  assert.equal(state.DEAD.draft, "사망자 초안")
})

test("gameChatReducer: 성공 ACK는 그 채널의 초안만 비우고 다른 채널 초안은 보존한다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "보낸 문장" })
  state = apply(state, { type: "DRAFT", channel: "DEAD", draft: "사망자 초안" })
  state = apply(state, { type: "SEND", channel: "DAY", requestToken: "DAY:1" })
  assert.equal(state.DAY.status, "sending")
  assert.equal(state.DEAD.status, "idle", "다른 채널의 전송 표시는 바뀌지 않는다")

  state = apply(state, {
    type: "ACK",
    channel: "DAY",
    generation: 0,
    requestToken: "DAY:1",
    ok: true,
    requestDraft: "보낸 문장",
  })

  assert.equal(state.DAY.draft, "")
  assert.equal(state.DEAD.draft, "사망자 초안")
  assert.equal(state.DAY.status, "idle")
  assert.equal(state.DAY.error, null)
  assert.equal(state.DAY.pendingToken, null)
})

test("gameChatReducer: 실패 ACK는 초안을 보존하고 그 채널의 error만 채운다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DEAD", draft: "보낸 문장" })
  state = sendThenAck(state, {
    channel: "DEAD",
    requestToken: "DEAD:1",
    ok: false,
    message: "요청을 처리할 수 없습니다.",
    requestDraft: "보낸 문장",
  })

  assert.equal(state.DEAD.draft, "보낸 문장")
  assert.equal(state.DEAD.status, "idle")
  assert.equal(state.DEAD.error, "요청을 처리할 수 없습니다.")
})

test("gameChatReducer: 한 채널의 status/error는 다른 채널로 절대 새지 않는다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "낮 문장" })
  state = sendThenAck(state, {
    channel: "DAY",
    requestToken: "DAY:1",
    ok: false,
    message: "낮 전용 오류",
    requestDraft: "낮 문장",
  })

  assert.equal(state.DAY.error, "낮 전용 오류")
  assert.equal(state.DEAD.error, null)
  assert.equal(state.DEAD.status, "idle")

  // 이번엔 반대 방향 — DEAD가 전송 중이어도 DAY의 오류/상태는 그대로다.
  state = apply(state, { type: "SEND", channel: "DEAD", requestToken: "DEAD:1" })
  assert.equal(state.DEAD.status, "sending")
  assert.equal(state.DAY.status, "idle")
  assert.equal(state.DAY.error, "낮 전용 오류")
})

test("gameChatReducer: 응답을 기다리는 동안 초안이 바뀌었으면 성공 ACK가 그 입력을 지우지 않는다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "보낸 문장" })
  state = apply(state, { type: "SEND", channel: "DAY", requestToken: "DAY:1" })
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "다음 문장" })

  state = apply(state, {
    type: "ACK",
    channel: "DAY",
    generation: 0,
    requestToken: "DAY:1",
    ok: true,
    requestDraft: "보낸 문장",
  })

  assert.equal(state.DAY.draft, "다음 문장")
})

// ---------------------------------------------------------------------------
// 세대(generation) · 요청 토큰(pendingToken) — 늦은/오래된 응답 무시
// ---------------------------------------------------------------------------

test("gameChatReducer: INVALIDATE 이후 도착한 ACK는 세대가 달라 아무 것도 바꾸지 않는다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "보낸 문장" })
  const capturedGeneration = state.DAY.generation
  state = apply(state, { type: "SEND", channel: "DAY", requestToken: "DAY:1" })

  state = gameChatReducer(state, { type: "INVALIDATE" })
  assert.equal(state.DAY.generation, capturedGeneration + 1)
  assert.equal(state.DAY.pendingToken, null)
  assert.equal(state.DAY.status, "idle")
  assert.equal(state.DAY.draft, "보낸 문장", "무효화는 초안을 지우지 않는다")

  const after = apply(state, {
    type: "ACK",
    channel: "DAY",
    generation: capturedGeneration,
    requestToken: "DAY:1",
    ok: true,
    requestDraft: "보낸 문장",
  })

  assert.equal(after, state, "무효화된 세대의 응답은 참조까지 그대로인 완전한 no-op이다")
})

test("gameChatReducer: INVALIDATE는 두 채널의 세대를 함께 올린다(한쪽만 남지 않는다)", () => {
  let state = seeded()
  state = gameChatReducer(state, { type: "INVALIDATE" })

  assert.equal(state.DAY.generation, 1)
  assert.equal(state.DEAD.generation, 1)
})

test("gameChatReducer: 같은 채널의 더 오래된 응답은 더 새로운 요청/초안을 덮어쓰지 못한다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "첫 번째" })
  const firstGeneration = state.DAY.generation
  state = apply(state, { type: "SEND", channel: "DAY", requestToken: "DAY:1" })

  // 무효화 → 새 요청. 이제 진행 중인 요청은 DAY:2뿐이다.
  state = gameChatReducer(state, { type: "INVALIDATE" })
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "두 번째" })
  state = apply(state, { type: "SEND", channel: "DAY", requestToken: "DAY:2" })

  // 뒤늦게 도착한 첫 요청의 성공 응답(세대·토큰 둘 다 어긋난다).
  const afterStaleAck = apply(state, {
    type: "ACK",
    channel: "DAY",
    generation: firstGeneration,
    requestToken: "DAY:1",
    ok: true,
    requestDraft: "첫 번째",
  })
  assert.equal(afterStaleAck, state)

  // 세대만 맞고 토큰이 어긋난 응답도 마찬가지로 무시된다(중복 ack 방어).
  const afterDuplicateAck = apply(state, {
    type: "ACK",
    channel: "DAY",
    generation: state.DAY.generation,
    requestToken: "DAY:1",
    ok: true,
    requestDraft: "두 번째",
  })
  assert.equal(afterDuplicateAck, state)

  // 진행 중인 요청의 응답만 반영된다.
  const applied = apply(state, {
    type: "ACK",
    channel: "DAY",
    generation: state.DAY.generation,
    requestToken: "DAY:2",
    ok: true,
    requestDraft: "두 번째",
  })
  assert.equal(applied.DAY.draft, "")
})

test("gameChatReducer: 같은 ACK가 두 번 도착해도 두 번째는 아무 것도 바꾸지 않는다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DEAD", draft: "한 번만" })
  const generation = state.DEAD.generation
  state = apply(state, { type: "SEND", channel: "DEAD", requestToken: "DEAD:1" })

  const ack = {
    type: "ACK",
    gameId: GAME,
    authUuid: ACCOUNT_A,
    channel: "DEAD",
    generation,
    requestToken: "DEAD:1",
    ok: true,
    requestDraft: "한 번만",
  }
  const first = gameChatReducer(state, ack)
  assert.equal(first.DEAD.draft, "")

  // 두 번째 도착: pendingToken이 이미 해제됐으므로 무시된다.
  state = apply(first, { type: "DRAFT", channel: "DEAD", draft: "다음 문장" })
  const second = gameChatReducer(state, ack)
  assert.equal(second, state)
  assert.equal(second.DEAD.draft, "다음 문장")
})

test("gameChatReducer: LOCAL_ERROR는 emit 없이 그 채널의 오류만 채우고 초안·세대·토큰은 건드리지 않는다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "   " })
  const before = state.DAY

  state = apply(state, { type: "LOCAL_ERROR", channel: "DAY", message: "메시지를 입력해주세요." })

  assert.equal(state.DAY.error, "메시지를 입력해주세요.")
  assert.equal(state.DAY.draft, "   ")
  assert.equal(state.DAY.status, "idle")
  assert.equal(state.DAY.generation, before.generation)
  assert.equal(state.DAY.pendingToken, before.pendingToken)
  assert.equal(state.DEAD.error, null)
})

test("gameChatReducer: 토큰이 없는 SEND는 무시된다(진행 중 요청을 만들지 않는다)", () => {
  const state = seeded()
  for (const requestToken of [undefined, null, "", 42]) {
    assert.equal(apply(state, { type: "SEND", channel: "DAY", requestToken }), state)
  }
})

test("gameChatReducer: 알 수 없는 채널의 액션은 어떤 상태도 바꾸지 않는다", () => {
  const state = seeded()
  for (const channel of [null, undefined, "JOKER", "day", 0]) {
    assert.equal(apply(state, { type: "DRAFT", channel, draft: "x" }), state)
    assert.equal(apply(state, { type: "SEND", channel, requestToken: "t" }), state)
    assert.equal(apply(state, { type: "RECEIVE", channel, message: message("m") }), state)
  }
})

// ---------------------------------------------------------------------------
// 신원(gameId + 인증 계정) — 소유자가 바뀌면 이전 소유자의 상태는 하나도 남지 않는다
// ---------------------------------------------------------------------------

/** 두 채널 모두에 메시지·초안·오류·진행 중 요청이 쌓인 상태를 만든다. */
function seededWithContent(gameId = GAME, authUuid = ACCOUNT_A) {
  let state = seeded(gameId, authUuid)
  for (const channel of ["DAY", "DEAD"]) {
    state = gameChatReducer(state, {
      type: "RECEIVE",
      gameId,
      authUuid,
      channel,
      message: message(`${channel}-m1`, `${channel} 대화`),
    })
    state = gameChatReducer(state, { type: "DRAFT", gameId, authUuid, channel, draft: `${channel} 초안` })
    state = gameChatReducer(state, { type: "SEND", gameId, authUuid, channel, requestToken: `${channel}:1` })
  }
  return state
}

test("gameChatReducer: 계정이 바뀌면 같은 gameId여도 이전 계정의 메시지·초안·상태가 전부 사라진다", () => {
  const withA = seededWithContent()
  assert.equal(withA.DAY.messages.length, 1)
  assert.equal(withA.DEAD.draft, "DEAD 초안")

  const withB = gameChatReducer(withA, { type: "CONTEXT_CHANGED", gameId: GAME, authUuid: ACCOUNT_B })

  assert.equal(withB.gameId, GAME)
  assert.equal(withB.authUuid, ACCOUNT_B)
  assert.deepEqual(withB.DAY, EMPTY_CHANNEL)
  assert.deepEqual(withB.DEAD, EMPTY_CHANNEL)
})

test("gameChatReducer: 계정 A로 되돌아와도 이전 상태는 되살아나지 않는다", () => {
  const withA = seededWithContent()
  const withB = gameChatReducer(withA, { type: "CONTEXT_CHANGED", gameId: GAME, authUuid: ACCOUNT_B })
  const backToA = gameChatReducer(withB, { type: "CONTEXT_CHANGED", gameId: GAME, authUuid: ACCOUNT_A })

  assert.deepEqual(backToA.DAY, EMPTY_CHANNEL)
  assert.deepEqual(backToA.DEAD, EMPTY_CHANNEL)

  // 되돌아온 뒤에도 이전 계정 시절의 진행 중 요청 토큰은 유효하지 않다(늦은 ACK 방어).
  const staleAck = gameChatReducer(backToA, {
    type: "ACK",
    gameId: GAME,
    authUuid: ACCOUNT_A,
    channel: "DAY",
    generation: 0,
    requestToken: "DAY:1",
    ok: true,
    requestDraft: "DAY 초안",
  })
  assert.equal(staleAck, backToA)
})

test("gameChatReducer: 인증 계정이 없어지면(로그아웃·계정 무효화) 소유한 상태가 전부 비워진다", () => {
  const withA = seededWithContent()

  for (const missing of [null, undefined, "", 42]) {
    const loggedOut = gameChatReducer(withA, { type: "CONTEXT_CHANGED", gameId: GAME, authUuid: missing })

    assert.equal(loggedOut.gameId, null, "계정이 없으면 gameId도 소유하지 않는다")
    assert.equal(loggedOut.authUuid, null)
    assert.deepEqual(loggedOut.DAY, EMPTY_CHANNEL)
    assert.deepEqual(loggedOut.DEAD, EMPTY_CHANNEL)

    // 소유자가 없는 동안에는 어떤 액션도 상태에 닿지 못한다.
    for (const action of [
      { type: "RECEIVE", channel: "DAY", message: message("m") },
      { type: "DRAFT", channel: "DAY", draft: "x" },
      { type: "SEND", channel: "DAY", requestToken: "DAY:9" },
      { type: "LOCAL_ERROR", channel: "DAY", message: "x" },
    ]) {
      assert.equal(gameChatReducer(loggedOut, { gameId: GAME, authUuid: ACCOUNT_A, ...action }), loggedOut)
      assert.equal(gameChatReducer(loggedOut, { gameId: GAME, authUuid: missing, ...action }), loggedOut)
    }
  }
})

test("gameChatReducer: gameId가 바뀌면 두 채널이 모두 초기화되고 다른 gameId의 액션은 무시된다", () => {
  const state = seededWithContent()

  const ignored = apply(state, { type: "DRAFT", gameId: "other-game", channel: "DAY", draft: "위조" })
  assert.equal(ignored, state)

  const switched = gameChatReducer(state, { type: "CONTEXT_CHANGED", gameId: "game-2", authUuid: ACCOUNT_A })
  assert.equal(switched.gameId, "game-2")
  assert.equal(switched.authUuid, ACCOUNT_A)
  assert.deepEqual(switched.DAY, EMPTY_CHANNEL)
  assert.deepEqual(switched.DEAD, EMPTY_CHANNEL)
})

test("gameChatReducer: 다른 계정·다른 게임의 늦은 ACK는 무시된다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "이전 문장" })
  state = apply(state, { type: "SEND", channel: "DAY", requestToken: "DAY:1" })

  const baseAck = {
    type: "ACK",
    channel: "DAY",
    generation: 0,
    requestToken: "DAY:1",
    ok: true,
    requestDraft: "이전 문장",
  }

  // (1) 이전 계정이 보낸 요청의 응답
  assert.equal(gameChatReducer(state, { ...baseAck, gameId: GAME, authUuid: ACCOUNT_B }), state)
  // (2) 이전 게임에서 보낸 요청의 응답
  assert.equal(gameChatReducer(state, { ...baseAck, gameId: "previous-game", authUuid: ACCOUNT_A }), state)
  // (3) 계정 정보가 아예 없는 응답
  assert.equal(gameChatReducer(state, { ...baseAck, gameId: GAME, authUuid: null }), state)

  // 같은 신원의 응답만 반영된다(양성 대조).
  const applied = gameChatReducer(state, { ...baseAck, gameId: GAME, authUuid: ACCOUNT_A })
  assert.equal(applied.DAY.draft, "")
})

test("gameChatReducer: 계정이 바뀐 뒤 도착한 수신 메시지는 어느 소유자 상태에도 append되지 않는다", () => {
  const withA = seededWithContent()
  const withB = gameChatReducer(withA, { type: "CONTEXT_CHANGED", gameId: GAME, authUuid: ACCOUNT_B })

  // 이전 계정 맥락으로 도착한 메시지 — 지금 소유자는 B다.
  const staleReceive = gameChatReducer(withB, {
    type: "RECEIVE",
    gameId: GAME,
    authUuid: ACCOUNT_A,
    channel: "DAY",
    message: message("late-1", "이전 계정 메시지"),
  })
  assert.equal(staleReceive, withB)
  assert.deepEqual(withB.DAY.messages, [])

  // 새 소유자 맥락의 메시지만 반영된다(양성 대조).
  const accepted = gameChatReducer(withB, {
    type: "RECEIVE",
    gameId: GAME,
    authUuid: ACCOUNT_B,
    channel: "DAY",
    message: message("new-1", "새 계정 메시지"),
  })
  assert.deepEqual(
    accepted.DAY.messages.map((m) => m.text),
    ["새 계정 메시지"],
  )
})

test("gameChatReducer: 같은 신원의 CONTEXT_CHANGED는 상태를 초기화하지 않는다(참조까지 그대로)", () => {
  const state = seededWithContent()

  assert.equal(gameChatReducer(state, { type: "CONTEXT_CHANGED", gameId: GAME, authUuid: ACCOUNT_A }), state)
})

// ---------------------------------------------------------------------------
// selectGameChatView — 접근할 수 없는 채널·다른 소유자의 상태 마스킹
// ---------------------------------------------------------------------------

test("selectGameChatView: gameId가 다르거나 보기 채널이 없으면 어떤 초안·메시지도 노출하지 않는다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "낮 초안" })
  state = apply(state, { type: "RECEIVE", channel: "DAY", message: message("m1") })

  assert.deepEqual(selectGameChatView(state, GAME, ACCOUNT_A, "DAY"), {
    draft: "낮 초안",
    messages: [message("m1")],
    status: "idle",
    error: null,
    generation: 0,
  })

  assert.deepEqual(selectGameChatView(state, "game-2", ACCOUNT_A, "DAY"), MASKED)
  assert.deepEqual(selectGameChatView(state, GAME, ACCOUNT_A, null), MASKED)
  assert.deepEqual(selectGameChatView(state, GAME, ACCOUNT_A, "JOKER"), MASKED)
})

test("selectGameChatView: 인증 계정이 어긋나면 gameId·채널이 같아도 전부 마스킹된다", () => {
  const state = seededWithContent()

  // 같은 게임·같은 채널이지만 지금 로그인된 계정이 다르다 — 이전 계정의 상태는 보이지 않는다.
  assert.deepEqual(selectGameChatView(state, GAME, ACCOUNT_B, "DAY"), MASKED)
  assert.deepEqual(selectGameChatView(state, GAME, ACCOUNT_B, "DEAD"), MASKED)

  // 소유자 본인에게는 그대로 보인다(양성 대조).
  assert.equal(selectGameChatView(state, GAME, ACCOUNT_A, "DAY").draft, "DAY 초안")
})

test("selectGameChatView: 인증 계정 자체가 없으면 어떤 상태도 노출하지 않는다(fail-closed)", () => {
  const state = seededWithContent()

  for (const missing of [null, undefined, "", 42, {}]) {
    assert.deepEqual(selectGameChatView(state, GAME, missing, "DAY"), MASKED)
    assert.deepEqual(selectGameChatView(state, GAME, missing, "DEAD"), MASKED)
  }
})

test("selectGameChatView: 소유자가 없는 초기 상태는 어떤 인자로도 노출되지 않는다", () => {
  const state = initialGameChatState()

  assert.deepEqual(selectGameChatView(state, GAME, ACCOUNT_A, "DAY"), MASKED)
  assert.deepEqual(selectGameChatView(state, null, null, "DAY"), MASKED)
})

test("selectGameChatView: 접근할 수 없는 채널의 status/error/전송 중 표시까지 전부 마스킹된다", () => {
  let state = seeded()
  state = apply(state, { type: "DRAFT", channel: "DAY", draft: "낮 초안" })
  state = sendThenAck(state, {
    channel: "DAY",
    requestToken: "DAY:1",
    ok: false,
    message: "낮 전용 오류",
    requestDraft: "낮 초안",
  })
  state = apply(state, { type: "SEND", channel: "DAY", requestToken: "DAY:2" })

  // 사망해서 볼 수 있는 채널이 DEAD가 되면, DAY의 오류도 "전송 중" 표시도 노출되지 않는다.
  const deadView = selectGameChatView(state, GAME, ACCOUNT_A, "DEAD")
  assert.deepEqual(deadView.messages, [])
  assert.equal(deadView.draft, "")
  assert.equal(deadView.status, "idle")
  assert.equal(deadView.error, null)
})

test("selectGameChatView: 사망으로 보기 채널이 DEAD가 되면 공개 DAY 메시지가 더 이상 노출되지 않는다", () => {
  let state = seeded()
  state = apply(state, { type: "RECEIVE", channel: "DAY", message: message("m1", "낮 대화") })

  const deadView = selectGameChatView(state, GAME, ACCOUNT_A, "DEAD")

  assert.deepEqual(deadView.messages, [])
  assert.equal(deadView.draft, "")
})
