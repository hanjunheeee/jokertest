// 남겨 둔 방장 자리 안내 시험: 안내 글, 남김 없으면 없음, 인원 수에 방장 자리 칸 안 셈, 방장이 정해지면 바뀜, 방장 없으면 방장 단추가 아무에게도 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-053~057 (대기방 화면 전체를 그려 봄)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"
import { openMatching, personOf, RESERVED_NOTICE, seatSlots } from "./matchingPage.mjs"

test.afterEach(K.resetAll)

const A = personOf(11)
const B = personOf(12)
const C = personOf(13)

// 방장만 보는 단추 (시작·설정 변경·추방)
const HOST_BUTTONS = ["게임시작", "방 설정 변경", "참가자 추방", "방 삭제하기"]
const hostButtonsShown = () => HOST_BUTTONS.filter((name) => K.button(name) !== null)

test("A08-F-053 남김 있음 → \"방장 자리를 비워 두었습니다. 지난 판 방장이 오지 않으면 먼저 들어온 사람이 방장이 됩니다.\"", async () => {
  await openMatching({ room: K.roomOf({ uuids: [B, C], hostUuid: null, reservedHostUuid: A }), me: B })
  assert.ok(K.RTL.screen.queryByText(RESERVED_NOTICE) !== null, "방장 자리 안내 글이 없음")
})

test("A08-F-054 reservedHostUuid null → 안내 글 없음", async () => {
  await openMatching({ room: K.roomOf({ uuids: [A, B, C], hostUuid: A, reservedHostUuid: null }), me: B })
  assert.equal(document.body.textContent.includes("방장 자리를 비워 두었습니다"), false)
})

test("A08-F-055 정원 7, 2명 + 방장 자리 → 인원은 2명 (방장 자리 칸은 안 셈)", async () => {
  await openMatching({ room: K.roomOf({ uuids: [B, C], hostUuid: null, reservedHostUuid: A, max: 7 }), me: C })
  // 자리 칸은 3개(방장 자리 + 2명)지만 인원은 2
  assert.equal(seatSlots().length, 3)
  const header = document.querySelector('[aria-label^="파티 인원"]')
  assert.ok(header !== null, "인원 머리말이 없음")
  assert.equal(header.getAttribute("aria-label"), "파티 인원 2명")
})

test("A08-F-056 host_changed { hostUuid:B, reservedHostUuid:null } → B 방장 표시, 방장 자리 칸·안내 사라짐", async () => {
  const room = K.roomOf({ uuids: [B, C], hostUuid: null, reservedHostUuid: A })
  const { sock } = await openMatching({ room, me: B })
  assert.equal(seatSlots()[0].reserved, true)
  assert.deepEqual(hostButtonsShown(), [])
  await sock.serverSays("host_changed", {
    hostUuid: B, reservedHostUuid: null, canStart: false, roomId: room.roomId,
    roomInstanceId: room.roomInstanceId, bootEpoch: room.bootEpoch, settingsVersion: room.settingsVersion,
  })
  await K.flush(10)
  assert.equal(K.useMatchingStore.getState().hostUuid, B)
  assert.equal(seatSlots().some((s) => s.reserved), false)
  assert.equal(seatSlots().length, 2)
  assert.equal(document.body.textContent.includes("방장 자리를 비워 두었습니다"), false)
  // B 화면에 방장 단추가 생김
  assert.ok(K.button("게임시작") !== null, "B에게 게임시작 단추가 없음")
})

test("A08-F-057 방장 칸 비고 남김 있음 → 들어온 누구(B·C)에게도 시작·설정·추방 단추 없음", async () => {
  for (const me of [B, C]) {
    await openMatching({ room: K.roomOf({ uuids: [B, C], hostUuid: null, reservedHostUuid: A }), me })
    assert.deepEqual(hostButtonsShown(), [], `${me === B ? "B" : "C"} 화면에 방장 단추가 있음`)
    // 방장 아닌 사람 단추는 보임 (화면이 빈 게 아님)
    assert.ok(K.button("방 나가기") !== null, "방 나가기 단추가 없음")
    K.RTL.cleanup()
    K.useMatchingStore.getState().clearRoom()
    K.useAuthStore.getState().logout()
  }
})
