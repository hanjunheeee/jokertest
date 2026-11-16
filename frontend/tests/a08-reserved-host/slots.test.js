// 남겨 둔 방장 자리 칸 시험: 방장 자리 칸이 맨 앞·그다음 사람들, 남김 없으면 칸 없음, 칸 글 "방장 자리"·그림 대체 글 "비워 둔 방장 자리"
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-050~052 (대기방 화면 전체를 그려 봄)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"
import { openMatching, personOf, seatSlots } from "./matchingPage.mjs"

const { buildSlots, RESERVED_HOST_SLOT_ID } = await import("../../src/domains/game/matching/utils/chunkPlayerSlots.js")

test.afterEach(K.resetAll)

// 원래 방장 A는 아직 안 옴, B·C가 "대기방으로"를 눌러 들어옴 (서버 return_to_room 답 모양)
const A = personOf(1)
const B = personOf(2)
const C = personOf(3)

test("A08-F-050 방 reservedHostUuid 있음 + 2명 → 자리 목록 첫 칸이 방장 자리(reserved-host-seat), 그다음 2명", async () => {
  const room = K.roomOf({ uuids: [B, C], hostUuid: null, reservedHostUuid: A })
  await openMatching({ room, me: B })
  const slots = seatSlots()
  assert.deepEqual(slots.map((s) => s.reserved), [true, false, false])
  // 자리 목록 값도 첫 칸 id가 방장 자리
  const listed = buildSlots({ isInRoom: true, players: room.players, hostSeatReserved: true })
  assert.deepEqual(listed.map((s) => s.id), [RESERVED_HOST_SLOT_ID, B, C])
  assert.equal(RESERVED_HOST_SLOT_ID, "reserved-host-seat")
})

test("A08-F-051 reservedHostUuid null → 방장 자리 칸 없음", async () => {
  const room = K.roomOf({ uuids: [A, B, C], hostUuid: A, reservedHostUuid: null })
  await openMatching({ room, me: B })
  const slots = seatSlots()
  assert.equal(slots.length, 3)
  assert.equal(slots.some((s) => s.reserved), false)
  assert.equal(document.querySelectorAll('[data-testid="matching-reserved-host-slot"]').length, 0)
})

test("A08-F-052 방장 자리 칸 그림 → 글 \"방장 자리\", 그림 대체 글 \"비워 둔 방장 자리\"", async () => {
  const room = K.roomOf({ uuids: [B, C], hostUuid: null, reservedHostUuid: A })
  await openMatching({ room, me: C })
  const [first] = seatSlots()
  assert.equal(first.reserved, true)
  assert.equal(first.text, "방장 자리")
  assert.equal(first.alt, "비워 둔 방장 자리")
})
