// 소켓 연결 시간 제한(5초) 및 StrictMode 초기 마운트 재사용 시험
// connectSocket·useSocket이 첫 악수 멈춤과 StrictMode 중복 연결을 막는지 검증함
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"
import { made, useSocketFactory } from "../a10-lobby-entry/ioMock.mjs"

const K = await import("../a10-lobby-entry/a10Kit.mjs")
const { React, RTL } = K
const { useSocket } = await import("../../src/shared/hooks/useSocket.js")
const { getSocket } = await import("../../src/shared/socket/socketClient.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")

const h = React.createElement

// disconnect 호출 횟수까지 기록하는 가짜 소켓 만들기
function createTrackedSocket(opts = {}) {
  const base = K.createFakeSocket({ ...opts, connected: false })
  base.disconnectCalls = 0
  const origDisconnect = base.disconnect
  base.disconnect = () => {
    base.disconnectCalls += 1
    return origDisconnect()
  }
  return base
}

useSocketFactory(createTrackedSocket)
test.afterEach(() => K.resetAll())

function Shell() {
  useSocket()
  return null
}

test("W2-1A connectSocket → io 옵션에 timeout: 5000·websocket·withCredentials 포함", async () => {
  K.signIn("me", "나")
  const before = made.length
  RTL.render(h(Shell))
  await K.flush()
  assert.equal(made.length, before + 1)
  const socket = made.at(-1)
  assert.equal(socket.madeWith.opts.withCredentials, true)
  assert.deepEqual(socket.madeWith.opts.transports, ["websocket"])
  assert.equal(socket.madeWith.opts.timeout, 5000)
})

test("W2-1B StrictMode 마운트 → 연결 중인 첫 소켓을 끊지 않고 1개만 유지", async () => {
  K.signIn("me", "나")
  const before = made.length
  RTL.render(h(React.StrictMode, null, h(Shell)))
  await K.flush()
  assert.equal(made.length, before + 1, "StrictMode에서도 소켓을 새로 또 만들지 않음")
  const socket = made.at(-1)
  assert.equal(socket.disconnectCalls, 0, "연결 중인 첫 소켓이 끊기지 않음")
  assert.equal(getSocket(), socket)
})

test("W2-1C 로그아웃·계정 전환·언마운트 → 이전 소켓 정상 해제", async () => {
  K.signIn("u-1", "일번")
  const view = RTL.render(h(React.StrictMode, null, h(Shell)))
  await K.flush()
  const first = made.at(-1)

  // 계정 전환: 이전 소켓 즉시 끊고 새 소켓 연결
  RTL.act(() => { useAuthStore.getState().login({ uuid: "u-2", nickname: "이번" }) })
  assert.equal(first.disconnectCalls, 1, "계정 바뀌면 이전 소켓 즉시 끊음")
  const second = made.at(-1)
  assert.notEqual(second, first)
  assert.equal(getSocket(), second)

  // 로그아웃: 현재 소켓 즉시 끊고 공용 소켓 비움
  RTL.act(() => { useAuthStore.getState().logout() })
  assert.equal(second.disconnectCalls, 1, "로그아웃하면 즉시 끊음")
  assert.equal(getSocket(), null)

  // 다시 로그인 뒤 언마운트: 마이크로태스크에 소켓 해제
  RTL.act(() => { useAuthStore.getState().login({ uuid: "u-3", nickname: "삼번" }) })
  const third = made.at(-1)
  view.unmount()
  assert.equal(getSocket(), null)
  await K.flush()
  assert.equal(third.disconnectCalls, 1, "언마운트 뒤 소켓 끊김")
})
