// "대기방으로" 늦은 답 시험(8초 넘어 온 성공 답): 결과 화면 그대로면 그 방으로, 화면을 떠났으면 방에서 나감, 계정이 바뀌었으면 아무것도 안 함, 이미 방에 있으면 그대로
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-033~036 (화면 상태, 00 B06-2)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"

const { useGameResultReturnToMatching } = await import("../../src/domains/game/result/hooks/useGameResultReturnToMatching.js")

test.afterEach(K.resetAll)

function ReturnProbe() {
  const { requestReturnToMatching, returnError } = useGameResultReturnToMatching()
  return K.h("div", null,
    K.h("button", { type: "button", onClick: () => { requestReturnToMatching() } }, "대기방으로"),
    K.h("p", { "data-testid": "error" }, returnError ?? ""),
  )
}
const errorText = () => document.querySelector('[data-testid="error"]')?.textContent ?? ""

// 결과 화면에서 "대기방으로" → 8초 동안 답 없음(답 없음 글) → 답은 서버가 쥐고 있음
async function pressAndWait8s(n) {
  K.startFakeClock(Date.now())
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n, me: 1 })
  sock.answer("get_current_room", { ok: true, room: null })
  sock.answer("return_to_room", K.HOLD)
  const view = await K.renderAt("/gameresult", K.h(ReturnProbe), { shell: false })
  await K.click(K.button("대기방으로"))
  await K.tick(8_000)
  await K.flush()
  if (!errorText().startsWith("서버 답이 없어")) throw new Error(`8초 뒤 답 없음 글이 아님: ${errorText()}`)
  const room = K.roomOf({ uuids: [g.meUuid], hostUuid: null, reservedHostUuid: g.seats[0].uuid })
  return { ...g, sock, view, room }
}

test("A08-F-033 6명 판: 8초 넘어 성공 답 + 아직 결과 화면 → 그 방으로 이동", async () => {
  const g = await pressAndWait8s(6)
  await g.sock.release("return_to_room", { ok: true, room: g.room })
  await K.flush()
  assert.equal(g.view.path(), "/game-matching")
  assert.equal(K.useMatchingStore.getState().roomId, g.room.roomId)
  assert.equal(g.sock.sentOf("leave_room").length, 0)
})

test("A08-F-034 7명 판: 8초 넘어 성공 답 + 결과 화면 떠남 → leave_room 보냄, 이동 없음", async () => {
  const g = await pressAndWait8s(7)
  // 결과 화면을 떠나 로비로 감
  await K.RTL.act(async () => { await g.view.router.navigate("/lobby") })
  const navigationsBefore = g.view.navigations.length
  await g.sock.release("return_to_room", { ok: true, room: g.room })
  await K.flush()
  assert.equal(g.sock.sentOf("leave_room").length, 1)
  assert.equal(g.view.path(), "/lobby")
  assert.equal(g.view.navigations.length, navigationsBefore)
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
})

test("A08-F-035 8명 판: 늦은 성공 답인데 다른 계정으로 로그인함 → 아무것도 안 함", async () => {
  const g = await pressAndWait8s(8)
  await K.RTL.act(async () => {
    K.useAuthStore.getState().logout()
    K.signIn("a07a0000-0000-4000-8000-000000555001", "다른 사람")
  })
  await g.sock.release("return_to_room", { ok: true, room: g.room })
  await K.flush()
  assert.equal(g.sock.sentOf("leave_room").length, 0)
  assert.equal(g.view.path(), "/gameresult")
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
})

test("A08-F-036 10명 판: 늦은 성공 답인데 이미 방에 있음 → 그대로, leave_room 안 보냄", async () => {
  const g = await pressAndWait8s(10)
  // 그사이 방 찾기로 이미 같은 방에 들어가 있음 (다른 인스턴스 값으로 구별)
  const already = { ...g.room, roomInstanceId: "inst-already" }
  await K.RTL.act(async () => { K.useMatchingStore.getState().setRoom(already) })
  await g.sock.release("return_to_room", { ok: true, room: g.room })
  await K.flush()
  assert.equal(g.sock.sentOf("leave_room").length, 0)
  assert.equal(K.useMatchingStore.getState().roomInstanceId, "inst-already")
  assert.equal(g.view.path(), "/gameresult")
})
