// 화면 상태 시험: 추방 실패 코드마다 우리말 글, 영어 코드가 글에 그대로 안 보임
// 목록 A01-F-501~522 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/kick-messages.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { resolveKickErrorMessage } = await import("../../src/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js")

const FALLBACK = "추방하지 못했습니다. 다시 시도해주세요."

// 목록 글이 "…"로 끝나면 앞부분만 맞춰 봄 (prefix), 아니면 글 전체
const CASES = [
  ["A01-F-501", "NOT_CONNECTED", "서버와 연결되어 있지 않습니다", "prefix"],
  ["A01-F-502", "NOT_READY", "방 정보가 아직 다 오지 않았습니다", "prefix"],
  ["A01-F-503", "NO_RESPONSE", "서버 응답이 없습니다. 결과를 확인한 뒤", "prefix"],
  ["A01-F-504", "VERIFY_FAILED", "참가자 목록을 다시 확인하지 못했습니다", "prefix"],
  ["A01-F-505", "ALREADY_LEFT", "이미 방에서 나간 참가자입니다.", "exact"],
  ["A01-F-506", "NOT_HOST", "방장만 추방할 수 있습니다.", "exact"],
  ["A01-F-507", "STALE_MEMBERSHIP", "참가자 목록이 바뀌었습니다", "prefix"],
  ["A01-F-508", "ADMISSION_PENDING", "입장 처리가 아직 끝나지 않았습니다", "prefix"],
  ["A01-F-509", "ROOM_NOT_FOUND", "방 정보가 바뀌었습니다. 창을 닫았다가 다시 열어주세요.", "exact"],
  ["A01-F-510", "NOT_IN_ROOM", "지금 방에 들어와 있지 않습니다", "prefix"],
  ["A01-F-511", "STALE_SOCKET", "연결이 바뀌었습니다", "prefix"],
  ["A01-F-512", "STALE_BOOT", "서버가 다시 시작되었습니다", "prefix"],
  ["A01-F-513", "RECEIPT_CAPACITY", "추방 요청이 너무 많습니다", "prefix"],
  ["A01-F-514", "REQUEST_ID_REUSED", "같은 요청이 이미 처리되었습니다", "prefix"],
  ["A01-F-515", "SELF_KICK", "자기 자신은 추방할 수 없습니다.", "exact"],
  ["A01-F-516", "ALREADY_IN_GAME", "게임이 이미 시작되어 추방할 수 없습니다.", "exact"],
  ["A01-F-517", "INVALID_REQUEST", "요청 내용이 맞지 않습니다", "prefix"],
  ["A01-F-518", "INTERNAL_ERROR", "서버에서 문제가 생겼습니다", "prefix"],
  ["A01-F-519", "XYZ", FALLBACK, "exact"],
  ["A01-F-520", null, FALLBACK, "exact"],
  ["A01-F-521", 123, FALLBACK, "exact"],
]

// 값 하나 = 시험 하나
for (const [id, code, expected, mode] of CASES) {
  test(`${id} 추방 실패 코드 ${String(code)} → "${expected}${mode === "prefix" ? "…" : ""}"`, () => {
    const message = resolveKickErrorMessage(code)
    if (mode === "exact") assert.equal(message, expected)
    else assert.ok(message.startsWith(expected), `받은 글: ${message}`)
  })
}

test("A01-F-522 추방 글 21개 전부에 영어 코드 모양(대문자·밑줄 4자 이상)이 없음", () => {
  for (const [, code] of CASES) {
    const message = resolveKickErrorMessage(code)
    assert.doesNotMatch(message, /[A-Z_]{4,}/, `${String(code)} 글: ${message}`)
  }
})
