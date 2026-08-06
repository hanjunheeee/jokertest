import test, { mock } from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")

// 훅이 최상단에서 import하는 socketClient를 제어 가능한 fake로 교체한다(useInGameSessionSnapshotSync
// 테스트와 동일한 관례) — mock.module은 아직 로드되지 않은 specifier에만 적용되므로 훅 모듈은
// 등록 이후 동적 import로 가져온다.
let currentFakeSocket = null
const fakeSocketSubscribers = new Set()

function fakeGetSocket() {
  return currentFakeSocket
}

function fakeSubscribeSocket(callback) {
  fakeSocketSubscribers.add(callback)
  return () => {
    fakeSocketSubscribers.delete(callback)
  }
}

function setFakeSocket(next) {
  currentFakeSocket = next
  for (const callback of [...fakeSocketSubscribers]) callback()
}

mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: { getSocket: fakeGetSocket, subscribeSocket: fakeSubscribeSocket },
})

const { useInGameStore } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useInGameGameChatSession } = await import("../useInGameGameChatSession.js")

function createFakeChatSocket() {
  const handlers = new Map()
  const emitWithAckCalls = []

  const socket = {
    connected: true,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(handler)
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },
    timeout() {
      return socket
    },
    emitWithAck(event, payload) {
      let resolve
      let reject
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      emitWithAckCalls.push({ event, payload, resolve, reject })
      return promise
    },
    listenerCount(event) {
      return handlers.get(event)?.size ?? 0
    },
    trigger(event, payload) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(payload)
    },
  }

  return { socket, emitWithAckCalls }
}

const GAME_ID = "game-1"
const ME = "me-uuid"
const OTHER = "other-uuid"
// 같은 기기에서 갈아끼우는 다른 인증 계정(게임 참가자 목록과는 무관한 축이다 — 계정만
// 바뀌어도 이 화면의 채팅 상태 소유자가 달라진다는 것을 보이기 위해 self는 그대로 둔다).
const ANOTHER_ACCOUNT = "another-account"

/** 인증 계정을 갈아끼운다 — 제출 시점에 캡처한 계정과 응답 시점의 계정을 비교하는 경로 검증용. */
function seedAuth(uuid) {
  useAuthStore.setState({ user: uuid === null ? null : { uuid }, isLoggedIn: uuid !== null, loggedOutIntentionally: false })
}

// selfUuid는 store가 들고 있는 게임 상태의 주인이다 — 기본값은 인증 계정과 같지만, "계정만
// 갈아끼우고 이전 계정의 게임 상태가 남아 있는" 순간을 재현할 때는 둘을 일부러 어긋나게 둔다.
function seedStore({ phase = "DAY", alive = true, team = "CITIZEN", authUuid = ME, selfUuid = ME } = {}) {
  seedAuth(authUuid)
  useInGameStore.setState({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase,
      dayIndex: 1,
      players: [
        { uuid: selfUuid, nickname: "Me", alive, isConnected: true },
        { uuid: OTHER, nickname: "Other", alive: true, isConnected: true },
      ],
      self: { uuid: selfUuid, nickname: "Me", role: team === "JOKER" ? "JOKER" : "CITIZEN", team },
      tribunal: null,
    },
    error: null,
  })
}

const getPlayerById = (uuid) =>
  ({ [ME]: { uuid: ME, nickname: "Me" }, [OTHER]: { uuid: OTHER, nickname: "Other" } })[uuid] ?? null

function renderChat() {
  return renderHook(() => useInGameGameChatSession({ getPlayerById }))
}

function broadcast({ channel = "DAY", id = "m1", text = "안녕", gameId = GAME_ID, senderUuid = OTHER } = {}) {
  return {
    event: channel === "DAY" ? "day_chat_message_received" : "dead_chat_message_received",
    payload: { gameId, messageId: id, senderUuid, nickname: "Other", text, sentAt: 1000, dayIndex: 1 },
  }
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

test("생존자의 DAY: send는 submit_game_chat_message를 정확히 1회, payload가 정확히 {gameId,text}만 담아 emit한다", () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("  안녕하세요  "))
  act(() => hook.result.current.send())

  assert.equal(fake.emitWithAckCalls.length, 1)
  assert.equal(fake.emitWithAckCalls[0].event, "submit_game_chat_message")
  assert.deepEqual(Object.keys(fake.emitWithAckCalls[0].payload).sort(), ["gameId", "text"])
  // 채널·발신자·닉네임은 payload에 없고, text는 서버와 동일한 규칙으로 trim된 값이다.
  assert.deepEqual(fake.emitWithAckCalls[0].payload, { gameId: GAME_ID, text: "안녕하세요" })

  hook.unmount()
})

test("응답 전 반복 호출(버튼 연타)은 추가 emit을 만들지 않는다", () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("한 번만"))
  act(() => hook.result.current.send())
  act(() => hook.result.current.send())
  act(() => hook.result.current.send())

  assert.equal(fake.emitWithAckCalls.length, 1)

  hook.unmount()
})

test("공백만 입력하면 emit하지 않는다", () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("   "))
  act(() => hook.result.current.send())

  assert.equal(fake.emitWithAckCalls.length, 0)

  hook.unmount()
})

test("성공 ack는 초안을 비우고, 실패 ack는 초안을 보존한 채 오류만 노출한다", async () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("성공할 문장"))
  act(() => hook.result.current.send())
  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: true })
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.draft, "")
  assert.equal(hook.result.current.error, null)

  act(() => hook.result.current.setDraft("실패할 문장"))
  act(() => hook.result.current.send())
  await act(async () => {
    fake.emitWithAckCalls[1].resolve({ ok: false, code: "RATE_LIMITED", message: "요청을 처리할 수 없습니다." })
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.draft, "실패할 문장")
  assert.equal(hook.result.current.error, "요청을 처리할 수 없습니다.")

  hook.unmount()
})

test("생존자는 day_chat_message_received만 렌더하고 dead_chat_message_received는 무시한다", () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  const day = broadcast({ channel: "DAY", id: "day-1", text: "낮 대화" })
  const dead = broadcast({ channel: "DEAD", id: "dead-1", text: "사망자 대화" })
  act(() => fake.socket.trigger(day.event, day.payload))
  act(() => fake.socket.trigger(dead.event, dead.payload))

  assert.deepEqual(
    hook.result.current.messages.map((m) => m.text),
    ["낮 대화"],
  )

  hook.unmount()
})

test("사망자는 dead_chat_message_received만 렌더하고 공개 DAY 메시지는 무시한다", () => {
  seedStore({ phase: "DAY", alive: false })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  const day = broadcast({ channel: "DAY", id: "day-1", text: "낮 대화" })
  const dead = broadcast({ channel: "DEAD", id: "dead-1", text: "사망자 대화" })
  act(() => fake.socket.trigger(day.event, day.payload))
  act(() => fake.socket.trigger(dead.event, dead.payload))

  assert.deepEqual(
    hook.result.current.messages.map((m) => m.text),
    ["사망자 대화"],
  )

  hook.unmount()
})

test("다른 gameId의 늦은 메시지는 반영되지 않는다", () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  const stale = broadcast({ channel: "DAY", id: "stale-1", gameId: "previous-game" })
  act(() => fake.socket.trigger(stale.event, stale.payload))

  assert.deepEqual(hook.result.current.messages, [])

  hook.unmount()
})

test("생존자의 NIGHT에서는 공개 채팅을 보낼 수 없다(emit 없음)", () => {
  seedStore({ phase: "NIGHT", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("밤에 보내기"))
  act(() => hook.result.current.send())

  assert.equal(fake.emitWithAckCalls.length, 0)

  hook.unmount()
})

test("사망자는 NIGHT에서도 보낼 수 있다(사망자 전용 채팅)", () => {
  seedStore({ phase: "NIGHT", alive: false })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("밤의 사망자 대화"))
  act(() => hook.result.current.send())

  assert.equal(fake.emitWithAckCalls.length, 1)
  assert.deepEqual(fake.emitWithAckCalls[0].payload, { gameId: GAME_ID, text: "밤의 사망자 대화" })

  hook.unmount()
})

test("socket이 교체되면 이전 socket의 수신 리스너가 남지 않고, 새 socket에만 등록된다", () => {
  seedStore({ phase: "DAY", alive: true })
  const first = createFakeChatSocket()
  setFakeSocket(first.socket)

  const hook = renderChat()
  assert.equal(first.socket.listenerCount("day_chat_message_received"), 1)
  assert.equal(first.socket.listenerCount("dead_chat_message_received"), 1)

  const second = createFakeChatSocket()
  act(() => setFakeSocket(second.socket))

  assert.equal(first.socket.listenerCount("day_chat_message_received"), 0)
  assert.equal(first.socket.listenerCount("dead_chat_message_received"), 0)
  assert.equal(second.socket.listenerCount("day_chat_message_received"), 1)

  // 교체된(죽은) socket으로 도착하는 메시지는 더 이상 반영되지 않는다.
  const stale = broadcast({ channel: "DAY", id: "stale-socket" })
  act(() => first.socket.trigger(stale.event, stale.payload))
  assert.deepEqual(hook.result.current.messages, [])

  hook.unmount()
  assert.equal(second.socket.listenerCount("day_chat_message_received"), 0)
})

test("반복 렌더는 수신 리스너를 누적 등록하지 않는다(중복 반영 없음)", () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  hook.rerender()
  hook.rerender()

  assert.equal(fake.socket.listenerCount("day_chat_message_received"), 1)

  const day = broadcast({ channel: "DAY", id: "once-1", text: "한 번만" })
  act(() => fake.socket.trigger(day.event, day.payload))
  assert.equal(hook.result.current.messages.length, 1)

  hook.unmount()
})

// ---------------------------------------------------------------------------
// 늦은 응답 방어 — 제출 시점에 캡처한 맥락이 하나라도 달라지면 그 응답은 아무 것도 바꾸지 않는다
// ---------------------------------------------------------------------------

test("DAY→NIGHT 이후 도착한 DAY 응답은 아무 것도 바꾸지 않는다(초안 유지·오류 없음)", async () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("낮에 보낸 문장"))
  act(() => hook.result.current.send())

  await act(async () => {
    seedStore({ phase: "NIGHT", alive: true })
    await flushMicrotasks()
  })
  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: true })
    await flushMicrotasks()
  })

  // 성공 응답이었지만 그 사이 유효 전송 채널이 사라졌으므로 초안은 지워지지 않는다.
  assert.equal(hook.result.current.draft, "낮에 보낸 문장")
  assert.equal(hook.result.current.error, null)
  assert.equal(hook.result.current.status, "idle")

  hook.unmount()
})

test("생존→사망 이후 도착한 DAY 실패 응답은 사망자 화면에 새어 나오지 않는다", async () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("생전에 보낸 문장"))
  act(() => hook.result.current.send())

  await act(async () => {
    seedStore({ phase: "DAY", alive: false })
    await flushMicrotasks()
  })
  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: false, message: "요청을 처리할 수 없습니다." })
    await flushMicrotasks()
  })

  // 지금 보이는 채널은 DEAD다 — DAY의 오류/전송 표시/초안이 하나도 노출되지 않는다.
  assert.equal(hook.result.current.error, null)
  assert.equal(hook.result.current.status, "idle")
  assert.equal(hook.result.current.draft, "")

  hook.unmount()
})

test("이전 계정으로 보낸 요청의 응답은 계정이 바뀐 뒤에는 아무 것도 바꾸지 않는다", async () => {
  seedStore({ phase: "DAY", alive: true, authUuid: ME })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("이전 계정의 문장"))
  act(() => hook.result.current.send())

  // 계정이 바뀌고, store도 새 계정이 소유한 게임 상태로 갱신된다(계정 전환 이후의 정상 상태).
  await act(async () => {
    seedStore({ phase: "DAY", alive: true, authUuid: ANOTHER_ACCOUNT, selfUuid: ANOTHER_ACCOUNT })
    await flushMicrotasks()
  })

  // 계정이 바뀌는 순간 이전 계정의 초안은 이미 사라져 있다(소유자 전환) — 새 계정이 자기 초안을 쓴다.
  assert.equal(hook.result.current.draft, "")
  act(() => hook.result.current.setDraft("새 계정의 문장"))

  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: true })
    await flushMicrotasks()
  })

  // 이전 계정의 성공 응답은 새 계정의 초안을 비우지도, 상태·오류를 건드리지도 못한다.
  assert.equal(hook.result.current.draft, "새 계정의 문장")
  assert.equal(hook.result.current.status, "idle")
  assert.equal(hook.result.current.error, null)

  hook.unmount()
})

test("계정만 바뀌고 store에 이전 계정의 게임 상태가 남아 있으면 전송·수신·초안이 전부 막힌다", () => {
  seedStore({ phase: "DAY", alive: true, authUuid: ME })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()

  // 인증 계정만 갈아끼운다 — store의 gameId·self(생존/phase)는 아직 이전 계정(ME)의 것이다.
  act(() => {
    seedAuth(ANOTHER_ACCOUNT)
  })

  // 새 계정은 이전 계정의 게임에 묶인 채팅 화면을 얻지 못한다(소유권 없음 → fail-closed).
  act(() => hook.result.current.setDraft("새 계정이 이전 게임에 쓰는 문장"))
  act(() => hook.result.current.send())

  assert.equal(fake.emitWithAckCalls.length, 0, "소유하지 않은 게임으로는 emit하지 않는다")
  assert.equal(hook.result.current.draft, "")
  assert.equal(hook.result.current.status, "idle")
  assert.equal(hook.result.current.error, null)

  const day = broadcast({ channel: "DAY", id: "leak-1", text: "이전 계정의 게임 메시지" })
  act(() => fake.socket.trigger(day.event, day.payload))
  assert.deepEqual(hook.result.current.messages, [])

  hook.unmount()
})

test("계정이 바뀐 뒤 이전 계정의 socket으로 늦게 도착한 메시지는 새 계정 화면에 섞이지 않는다", () => {
  seedStore({ phase: "DAY", alive: true, authUuid: ME })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()

  // 같은 socket을 쓰는 채로 계정이 B로 바뀌고, store도 B가 소유한 게임 상태로 갱신됐다
  // (소유권 게이팅만으로는 걸러지지 않는 상황 — 리스너가 어느 계정의 연결인지가 유일한 근거다).
  act(() => seedStore({ phase: "DAY", alive: true, authUuid: ANOTHER_ACCOUNT, selfUuid: ANOTHER_ACCOUNT }))

  // 이 socket은 여전히 이전 계정(ME)으로 인증된 연결이다 — 그 연결로 오는 메시지는 B의 것이 아니다.
  const late = broadcast({ channel: "DAY", id: "late-1", text: "이전 계정의 메시지" })
  act(() => fake.socket.trigger(late.event, late.payload))
  assert.deepEqual(hook.result.current.messages, [])

  // 새 계정의 메시지는 새 socket(useSocket이 계정 전환 때 새로 만드는 연결)에서만 받는다.
  const next = createFakeChatSocket()
  act(() => setFakeSocket(next.socket))
  const fresh = broadcast({ channel: "DAY", id: "fresh-1", text: "새 계정의 메시지" })
  act(() => next.socket.trigger(fresh.event, fresh.payload))

  assert.deepEqual(
    hook.result.current.messages.map((m) => m.text),
    ["새 계정의 메시지"],
  )

  hook.unmount()
})

test("같은 채널의 더 오래된 응답은 더 새로운 요청의 초안·상태를 덮어쓰지 않는다", async () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("첫 번째"))
  act(() => hook.result.current.send())

  // 첫 요청이 아직 응답을 기다리는 동안 phase가 오갔다 — 무효화로 전송 잠금이 풀린다.
  await act(async () => {
    seedStore({ phase: "NIGHT", alive: true })
    await flushMicrotasks()
  })
  await act(async () => {
    seedStore({ phase: "DAY", alive: true })
    await flushMicrotasks()
  })

  act(() => hook.result.current.setDraft("두 번째"))
  act(() => hook.result.current.send())
  assert.equal(fake.emitWithAckCalls.length, 2)

  // 이제서야 첫 요청의 늦은 성공 응답이 도착한다.
  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: true })
    await flushMicrotasks()
  })

  // 더 새로운 요청이 진행 중이므로 오래된 성공 응답이 초안을 지우거나 상태를 되돌리지 못한다.
  assert.equal(hook.result.current.draft, "두 번째")
  assert.equal(hook.result.current.status, "sending")

  hook.unmount()
})

test("socket이 교체되면 이전 socket으로 보낸 요청의 응답은 반영되지 않는다", async () => {
  seedStore({ phase: "DAY", alive: true })
  const first = createFakeChatSocket()
  setFakeSocket(first.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("교체 전 문장"))
  act(() => hook.result.current.send())

  const second = createFakeChatSocket()
  await act(async () => {
    setFakeSocket(second.socket)
    await flushMicrotasks()
  })
  await act(async () => {
    first.emitWithAckCalls[0].resolve({ ok: true })
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.draft, "교체 전 문장")
  assert.equal(hook.result.current.error, null)

  hook.unmount()
})

test("DAY 오류가 남아있는 상태로 사망해도 DEAD 화면에는 오류가 없고, DEAD 전송은 정상 동작한다", async () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("실패할 문장"))
  act(() => hook.result.current.send())
  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: false, message: "요청을 처리할 수 없습니다." })
    await flushMicrotasks()
  })
  assert.equal(hook.result.current.error, "요청을 처리할 수 없습니다.")

  await act(async () => {
    seedStore({ phase: "NIGHT", alive: false })
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.error, null)
  assert.equal(hook.result.current.draft, "")

  act(() => hook.result.current.setDraft("사망자 문장"))
  act(() => hook.result.current.send())
  assert.equal(fake.emitWithAckCalls.length, 2)
  assert.deepEqual(fake.emitWithAckCalls[1].payload, { gameId: GAME_ID, text: "사망자 문장" })

  hook.unmount()
})

test("게임이 ENDED가 되면 어느 쪽 채널로도 보낼 수 없다", () => {
  seedStore({ phase: "ENDED", alive: false })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("종료 후 문장"))
  act(() => hook.result.current.send())

  assert.equal(fake.emitWithAckCalls.length, 0)

  hook.unmount()
})

test("세션이 정리되면(gameId null) 진행 중이던 요청의 응답이 반영되지 않는다", async () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("이탈 직전 문장"))
  act(() => hook.result.current.send())

  await act(async () => {
    useInGameStore.getState().clearGame()
    await flushMicrotasks()
  })
  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: false, message: "누출되면 안 되는 오류" })
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.error, null)
  assert.equal(hook.result.current.status, "idle")

  hook.unmount()
})

test("반복되는 DAY 사이클(NIGHT을 지나 다시 DAY가 되어도)에서 다시 보낼 수 있다", async () => {
  seedStore({ phase: "DAY", alive: true })
  const fake = createFakeChatSocket()
  setFakeSocket(fake.socket)

  const hook = renderChat()
  act(() => hook.result.current.setDraft("첫 낮"))
  act(() => hook.result.current.send())
  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: true })
    await flushMicrotasks()
  })

  await act(async () => {
    seedStore({ phase: "NIGHT", alive: true })
    await flushMicrotasks()
  })
  act(() => hook.result.current.send())
  assert.equal(fake.emitWithAckCalls.length, 1, "밤에는 공개 채팅을 보낼 수 없다")

  await act(async () => {
    seedStore({ phase: "DAY", alive: true })
    await flushMicrotasks()
  })
  act(() => hook.result.current.setDraft("둘째 낮"))
  act(() => hook.result.current.send())

  assert.equal(fake.emitWithAckCalls.length, 2)
  assert.deepEqual(fake.emitWithAckCalls[1].payload, { gameId: GAME_ID, text: "둘째 낮" })

  hook.unmount()
})
