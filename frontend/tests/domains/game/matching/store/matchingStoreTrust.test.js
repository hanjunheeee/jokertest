// 방 스토어 로컬 믿음(markLocalRoomTrust) 시험: 방 만든 직후·결과→대기방 직후 20초 동안 서버 확인 전 방을 믿음, 비우기·풀기, 칸 이름 다른 방 값 넣기
// 목록 A01-F-755~758 (방 만들기 훅·결과 화면 복귀가 씀, 대기방 머묾 판단은 canStayOnMatchingPage), 돌리기(frontend): node --experimental-test-module-mocks --test tests/domains/game/matching/store/matchingStoreTrust.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { useMatchingStore } from "../../../../../src/domains/game/matching/store/matchingStore.js"
import { LOCAL_ROOM_TRUST_MS } from "../../../../../src/domains/game/matching/constants/roomTiming.js"
import { canStayOnMatchingPage } from "../../../../../src/domains/game/matching/utils/canStayOnMatchingPage.js"

const NOW = 1_800_000_000_000
test.beforeEach(() => mock.timers.enable({ apis: ["Date"], now: NOW }))
test.afterEach(() => {
  useMatchingStore.getState().clearRoom()
  mock.timers.reset()
})

// 스토어 값으로 대기방에 머물 수 있는지 (나 = me)
const canStay = () => {
  const s = useMatchingStore.getState()
  return canStayOnMatchingPage({
    awaiting: false, isInRoom: s.isInRoom, roomId: s.roomId, players: s.players, myUuid: "me", roomLocalTrustUntil: s.roomLocalTrustUntil,
  })
}

test("A01-F-755 markLocalRoomTrust → 믿음 끝 = 지금 + 20초(LOCAL_ROOM_TRUST_MS)", () => {
  assert.equal(LOCAL_ROOM_TRUST_MS, 20_000)
  useMatchingStore.getState().markLocalRoomTrust()
  assert.equal(useMatchingStore.getState().roomLocalTrustUntil, NOW + LOCAL_ROOM_TRUST_MS)
})

test("A01-F-756 믿음 20초 안 → 명단이 아직 비어도 대기방에 머묾, 20초 지나면 못 머묾", () => {
  useMatchingStore.getState().setRoom({ id: "room-1", players: [] })
  useMatchingStore.getState().markLocalRoomTrust()
  assert.equal(canStay(), true)
  mock.timers.tick(LOCAL_ROOM_TRUST_MS - 1)
  assert.equal(canStay(), true)
  mock.timers.tick(1)
  assert.equal(canStay(), false)
})

test("A01-F-757 clearLocalRoomTrust·clearRoom → 믿음 0으로", () => {
  useMatchingStore.getState().markLocalRoomTrust()
  useMatchingStore.getState().clearLocalRoomTrust()
  assert.equal(useMatchingStore.getState().roomLocalTrustUntil, 0)
  useMatchingStore.getState().markLocalRoomTrust()
  useMatchingStore.getState().clearRoom()
  assert.equal(useMatchingStore.getState().roomLocalTrustUntil, 0)
})

test("A01-F-758 setRoom에 방 만들기 답 모양(id·code) → roomId·roomCode로 들어가고 방에 있음, id 없는 값은 무시", () => {
  useMatchingStore.getState().setRoom({ id: "room-7", code: "QW12", players: [{ uuid: "me" }], hostUuid: "me" })
  const s = useMatchingStore.getState()
  assert.equal(s.isInRoom, true)
  assert.equal(s.roomId, "room-7")
  assert.equal(s.roomCode, "QW12")
  const revision = s.roomRevision
  useMatchingStore.getState().setRoom({ code: "NOID" })
  assert.equal(useMatchingStore.getState().roomId, "room-7")
  assert.equal(useMatchingStore.getState().roomRevision, revision)
})
