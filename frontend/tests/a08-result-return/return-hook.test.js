// "대기방으로" 훅 시험: 성공이면 판 지우고 방 넣고 대기방 화면, 보내는 사건은 return_to_room 하나, 거절 까닭 글, 답 없음·연결 없음·판 id 없음 글, 거절이어도 이미 방이면 그 방, 두 번 눌러도 한 번
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-020~032·037 (화면 상태)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"

const { useGameResultReturnToMatching } = await import("../../src/domains/game/result/hooks/useGameResultReturnToMatching.js")

test.afterEach(K.resetAll)

// 훅 값 보기: "대기방으로" 단추 + 실패 글 + 누르는 중 표시
function ReturnProbe() {
  const { requestReturnToMatching, isReturning, returnError } = useGameResultReturnToMatching()
  return K.h("div", null,
    K.h("button", { type: "button", onClick: () => { requestReturnToMatching() } }, "대기방으로"),
    K.h("p", { "data-testid": "error" }, returnError ?? ""),
    K.h("p", { "data-testid": "returning" }, isReturning ? "가는 중" : ""),
  )
}
const errorText = () => document.querySelector('[data-testid="error"]')?.textContent ?? ""
const press = () => K.click(K.button("대기방으로"))

// 끝난 판 결과 화면에서 훅을 그림 (지금 내 방 묻기는 기본 "방 없음")
async function openReturn({ n = 6, me = 1, connected = true } = {}) {
  const sock = K.installFakeSocket({ connected })
  const g = K.endedGame({ n, me })
  sock.answer("get_current_room", { ok: true, room: null })
  const view = await K.renderAt("/gameresult", K.h(ReturnProbe), { shell: false })
  return { ...g, sock, view }
}

// 판 끝 뒤 다시 열린 같은 코드 방 (나만 들어감, 원래 방장 자리 남김)
const reopenedRoom = (g) => K.roomOf({ uuids: [g.meUuid], hostUuid: null, reservedHostUuid: g.seats[0].uuid })

test("A08-F-020 6명 판: 답 { ok:true, room } → 판 정보 지움, 방 정보 넣음, /game-matching으로 이동", async () => {
  const g = await openReturn({ n: 6 })
  const room = reopenedRoom(g)
  g.sock.answer("return_to_room", { ok: true, room })
  await press()
  await K.flush()
  assert.equal(g.view.path(), "/game-matching")
  assert.equal(K.useInGameStore.getState().gameId, null)
  assert.equal(K.useMatchingStore.getState().isInRoom, true)
  assert.equal(K.useMatchingStore.getState().roomId, room.roomId)
  assert.equal(K.useMatchingStore.getState().roomCode, room.roomCode)
})

test("A08-F-021 7명 판: \"대기방으로\" → return_to_room { gameId } 한 번, create_room·get_party_matching_room 안 보냄", async () => {
  const g = await openReturn({ n: 7 })
  g.sock.answer("return_to_room", { ok: true, room: reopenedRoom(g) })
  await press()
  await K.flush()
  assert.deepEqual(g.sock.sentOf("return_to_room"), [{ gameId: g.gameId }])
  assert.equal(g.sock.sentOf("create_room").length, 0)
  assert.equal(g.sock.sentOf("get_party_matching_room").length, 0)
})

// 거절 까닭 글 (서버 답 코드 → 화면 글)
const REJECT_CASES = [
  ["A08-F-022", "ROOM_NOT_FOUND", { code: "ROOM_NOT_FOUND" }, "대기방이 이미 없어져 돌아갈 수 없습니다. '로비로'를 눌러 주세요."],
  ["A08-F-023", "ROOM_FULL", { code: "ROOM_FULL" }, "대기방 정원이 가득 차 들어갈 수 없습니다."],
  ["A08-F-024", "KICKED_TOO_MANY_TIMES", { code: "KICKED_TOO_MANY_TIMES" }, "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다."],
  ["A08-F-025", "SESSION_ENDED", { code: "SESSION_ENDED" }, "결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다."],
  ["A08-F-026", "NODE_DRAINING", { code: "NODE_DRAINING" }, "서버 점검 준비 중이라 대기방으로 돌아갈 수 없습니다."],
  ["A08-F-027", "모르는 코드 + 서버 글", { code: "SOMETHING_NEW", message: "서버가 보낸 까닭 글" }, "서버가 보낸 까닭 글"],
  ["A08-F-028", "모르는 코드 + 글 없음", { code: "SOMETHING_NEW" }, "대기방으로 가지 못했습니다. '대기방으로'를 다시 눌러 주세요."],
]
for (const [no, name, reply, expected] of REJECT_CASES) {
  test(`${no} 8명 판 거절 까닭 글: ${name} → "${expected}"`, async () => {
    const g = await openReturn({ n: 8 })
    g.sock.answer("return_to_room", { ok: false, ...reply })
    await press()
    await K.waitUntil(() => errorText().length > 0, { label: "거절 글" })
    assert.equal(errorText(), expected)
    // 결과 화면 그대로, 판 정보도 그대로
    assert.equal(g.view.path(), "/gameresult")
    assert.equal(K.useInGameStore.getState().gameId, g.gameId)
  })
}

test("A08-F-029 5명 판: 답 없음 → \"서버 답이 없어 대기방으로 가지 못했습니다. …다시 눌러 주세요.\"", async () => {
  K.startFakeClock(Date.now())
  const g = await openReturn({ n: 5 })
  // return_to_room 답 안 옴 → 8초 뒤 답 없음
  await press()
  await K.tick(8_000)
  await K.flush()
  assert.match(errorText(), /^서버 답이 없어 대기방으로 가지 못했습니다\. .*다시 눌러 주세요\.$/)
  assert.equal(g.view.path(), "/gameresult")
})

test("A08-F-030 6명 판: 연결 끊김 → \"연결이 끊겨 대기방으로 가지 못했습니다. …\", 사건 안 보냄", async () => {
  const g = await openReturn({ n: 6, connected: false })
  await press()
  assert.match(errorText(), /^연결이 끊겨 대기방으로 가지 못했습니다\. /)
  assert.equal(g.sock.sentOf("return_to_room").length, 0)
})

test("A08-F-031 7명 판: 판 id 없음 → \"끝난 판을 찾지 못해 대기방으로 갈 수 없습니다. '로비로'를 눌러 주세요.\", 사건 안 보냄", async () => {
  const g = await openReturn({ n: 7 })
  // 판 정보가 지워진 뒤 (로그인·연결은 그대로)
  await K.RTL.act(async () => { K.useInGameStore.getState().clearGame() })
  await press()
  assert.equal(errorText(), "끝난 판을 찾지 못해 대기방으로 갈 수 없습니다. '로비로'를 눌러 주세요.")
  assert.equal(g.sock.sentOf("return_to_room").length, 0)
})

test("A08-F-032 8명 판: 답 거절 + get_current_room 답에 방 있음 → 그 방으로 이동, 글 없음", async () => {
  const g = await openReturn({ n: 8 })
  const room = reopenedRoom(g)
  g.sock.answer("return_to_room", { ok: false, code: "ROOM_FULL" })
  g.sock.answer("get_current_room", { ok: true, room })
  await press()
  await K.waitUntil(() => g.view.path() === "/game-matching", { label: "대기방 이동" })
  assert.equal(errorText(), "")
  assert.equal(K.useMatchingStore.getState().roomId, room.roomId)
})

test("A08-F-037 10명 판: 답 전 두 번 누름 → return_to_room 1번", async () => {
  const g = await openReturn({ n: 10 })
  g.sock.answer("return_to_room", K.HOLD)
  await press()
  await press()
  assert.equal(g.sock.sentOf("return_to_room").length, 1)
  // 답이 오면 한 번만 들어감
  await g.sock.release("return_to_room", { ok: true, room: reopenedRoom(g) })
  await K.flush()
  assert.equal(g.view.path(), "/game-matching")
  assert.equal(g.sock.sentOf("return_to_room").length, 1)
})
