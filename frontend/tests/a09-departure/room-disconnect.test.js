// 대기방 화면 끊김 시험(화면 부품, 대기방 화면 전체): 손님 15초 빠짐·방장 넘어옴·끊긴 사람 있는 채 시작 거절 글·내 방이 없어지면 방 목록
// 목록 A09-끊김-나가기-탈주.md A09-F-269~272, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/room-disconnect.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")

test.afterEach(() => K.reset())

// 자리 칸 실루엣 (준비한 사람·안 한 사람)
const seatImages = () => [...document.querySelectorAll('img[alt="준비 완료한 참가자"], img[alt="준비 전 참가자"]')]
const startButton = () => document.querySelector('button[aria-label="게임시작"]')

// 대기방 화면 그리기 (me 자리로 로그인, 방 확인 끝날 때까지)
async function openMatching({ n = 6, me = 0, ready = [], canStart = false } = {}) {
  const room = K.roomOf({ n, ready, canStart })
  const seated = K.sitInRoom({ room, me })
  await K.renderRoutes({ path: "/game-matching", element: K.h(GameMatchingPage), routes: { "/ingame": K.h("p", null, "판 화면 (시험 자리)") } })
  await K.waitUntil(() => seatImages().length === n, { what: "자리 칸" })
  return { room, ...seated }
}

test("A09-F-269 6명 방 손님 4번 끊겨 15초(player_left_room) → 자리 칸 하나 빠짐", async () => {
  const { room, fake } = await openMatching({ n: 6, me: 0 })
  await K.RTL.act(async () => { fake.fire("player_left_room", { uuid: room.players[4].uuid, canStart: false, roomId: room.roomId }) })
  await K.flush()
  assert.equal(seatImages().length, 5)
  assert.equal(K.useMatchingStore.getState().players.some((p) => p.uuid === room.players[4].uuid), false)
})

test("A09-F-270 7명 방 방장 끊겨 15초(host_changed → 나) → 내 화면에 방장 단추(게임시작)", async () => {
  const { room, fake } = await openMatching({ n: 7, me: 1 })
  assert.ok(startButton() === null, "손님인데 처음부터 방장 단추가 있음")
  await K.RTL.act(async () => {
    fake.fire("player_left_room", { uuid: room.players[0].uuid, canStart: false, roomId: room.roomId })
    fake.fire("host_changed", { hostUuid: room.players[1].uuid, canStart: false, roomId: room.roomId, settingsVersion: room.settingsVersion })
  })
  await K.waitUntil(() => startButton() !== null, { what: "방장 단추" })
  assert.equal(K.useMatchingStore.getState().hostUuid, room.players[1].uuid)
})

test("A09-F-271 6명 방 손님 1명 끊긴 채 방장이 시작 → \"일부 참가자와의 연결을 확인할 수 없습니다\" 글", async () => {
  const text = "일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요."
  const { fake } = await openMatching({ n: 6, me: 0, ready: [0, 1, 2, 3, 4, 5], canStart: true })
  fake.answer("start_game", { ok: false, code: "PARTICIPANT_UNAVAILABLE", message: text })
  await K.waitUntil(() => startButton() !== null && !startButton().disabled, { what: "게임시작 단추" })
  await K.click(startButton())
  await K.flush(10)
  assert.equal(fake.sentOf("start_game").length, 1)
  const alerts = [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent)
  assert.ok(alerts.some((t) => t.includes("일부 참가자와의 연결을 확인할 수 없습니다")), `글: ${JSON.stringify(alerts)}`)
})

test("A09-F-272 8명 방 내가 끊겼다 붙었는데 방이 없어짐(get_current_room 방 없음) → 방 목록(/multiplay)", async () => {
  const { fake, roomAnswer } = await openMatching({ n: 8, me: 3 })
  roomAnswer.current = { ok: true, room: null }
  await K.dropConnection(fake)
  await K.restoreConnection(fake)
  await K.waitUntil(() => K.path() === "/multiplay", { what: "방 목록으로" })
  assert.equal(K.path(), "/multiplay")
})
