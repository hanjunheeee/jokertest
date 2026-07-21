import test from "node:test"
import assert from "node:assert/strict"
import { getSocket, setSocket, subscribeSocket } from "../socketClient.js"

// socketClient는 모듈 싱글턴(_socket)을 쓰므로, 각 테스트가 서로의 상태에 영향을 주지
// 않도록 매번 null로 되돌린다.
test.beforeEach(() => setSocket(null))
test.after(() => setSocket(null))

test("getSocket()은 항상 최신 값을 반환한다", () => {
  assert.equal(getSocket(), null)
  const socketA = { id: "a" }
  setSocket(socketA)
  assert.equal(getSocket(), socketA)
  const socketB = { id: "b" }
  setSocket(socketB)
  assert.equal(getSocket(), socketB)
})

test("subscribeSocket으로 등록한 listener는 setSocket(new)이 호출될 때마다 알림을 받는다", () => {
  const calls = []
  const unsubscribe = subscribeSocket(() => calls.push(getSocket()))

  const socketA = { id: "a" }
  setSocket(socketA)
  assert.deepEqual(calls, [socketA])

  const socketB = { id: "b" }
  setSocket(socketB)
  assert.deepEqual(calls, [socketA, socketB])

  unsubscribe()
})

test("unsubscribe() 이후에는 listener가 더 이상 호출되지 않는다", () => {
  let callCount = 0
  const unsubscribe = subscribeSocket(() => { callCount += 1 })

  setSocket({ id: "a" })
  assert.equal(callCount, 1)

  unsubscribe()
  setSocket({ id: "b" })
  assert.equal(callCount, 1) // unsubscribe 이후 변화는 반영되지 않음
})

test("같은 참조로 setSocket을 다시 호출하면 listener를 호출하지 않는다", () => {
  const socketA = { id: "a" }
  setSocket(socketA)

  let callCount = 0
  const unsubscribe = subscribeSocket(() => { callCount += 1 })

  setSocket(socketA) // 이미 같은 참조 — 알림 없어야 함
  assert.equal(callCount, 0)

  setSocket({ id: "a2" }) // 값은 비슷해도 다른 참조 — 알림 있어야 함
  assert.equal(callCount, 1)

  unsubscribe()
})

test("null → socket → null 전이에서 매 실제 참조 변경마다 정확히 한 번씩 알림이 온다", () => {
  const events = []
  const unsubscribe = subscribeSocket(() => events.push(getSocket()))

  setSocket(null) // 이미 null — 알림 없음
  assert.equal(events.length, 0)

  const socketA = { id: "a" }
  setSocket(socketA)
  assert.deepEqual(events, [socketA])

  setSocket(null)
  assert.deepEqual(events, [socketA, null])

  unsubscribe()
})

test("서로 다른 구독자는 독립적으로 알림을 받고, 한쪽의 unsubscribe가 다른 쪽에 영향을 주지 않는다", () => {
  let firstCalls = 0
  let secondCalls = 0
  const unsubscribeFirst = subscribeSocket(() => { firstCalls += 1 })
  const unsubscribeSecond = subscribeSocket(() => { secondCalls += 1 })

  setSocket({ id: "a" })
  assert.equal(firstCalls, 1)
  assert.equal(secondCalls, 1)

  unsubscribeFirst()
  setSocket({ id: "b" })
  assert.equal(firstCalls, 1) // 구독 해제됨
  assert.equal(secondCalls, 2) // 여전히 구독 중

  unsubscribeSecond()
})
