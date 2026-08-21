import test from "node:test"
import assert from "node:assert/strict"
import { reduceInGameNightPrivateResult } from "../reduceInGameNightPrivateResult.js"

const PLAYERS = [
  { uuid: "u-self", nickname: "나", alive: true },
  { uuid: "u-target", nickname: "홍길동", alive: true },
  { uuid: "u-nameless", nickname: "", alive: true },
]

test("INVESTIGATE(경비대 조사)는 대상 진영을 역할 공개와 같은 표기로 알려준다", () => {
  assert.deepEqual(
    reduceInGameNightPrivateResult(
      { gameId: "g1", dayIndex: 1, actionType: "INVESTIGATE", targetId: "u-target", team: "JOKER" },
      PLAYERS,
    ),
    { kind: "INVESTIGATE", targetNickname: "홍길동", label: "홍길동 님은 광대 진영입니다" },
  )

  assert.deepEqual(
    reduceInGameNightPrivateResult(
      { gameId: "g1", dayIndex: 1, actionType: "INVESTIGATE", targetId: "u-target", team: "CITIZEN" },
      PLAYERS,
    ),
    { kind: "INVESTIGATE", targetNickname: "홍길동", label: "홍길동 님은 시민 진영입니다" },
  )
})

// [role, 화면에 나가야 하는 역할명]
const confirmCases = [
  ["JOKER", "광대"],
  ["CITIZEN", "시민"],
  ["DOCTOR", "의사"],
  ["GUARD", "경비대"],
  ["WITCH_HUNTER", "마녀사냥꾼"],
]

for (const [role, name] of confirmCases) {
  test(`CONFIRM(마녀사냥꾼 확인) ${role} → "${name}"`, () => {
    assert.deepEqual(
      reduceInGameNightPrivateResult(
        { gameId: "g1", dayIndex: 2, actionType: "CONFIRM", targetId: "u-target", role },
        PLAYERS,
      ),
      { kind: "CONFIRM", targetNickname: "홍길동", label: `홍길동 님의 역할은 ${name}입니다` },
    )
  })
}

test("targetId가 roster에 없으면 uuid를 노출하지 않고 표시 자체를 포기한다(null)", () => {
  assert.equal(
    reduceInGameNightPrivateResult(
      { gameId: "g1", dayIndex: 1, actionType: "INVESTIGATE", targetId: "u-unknown", team: "JOKER" },
      PLAYERS,
    ),
    null,
  )
  assert.equal(
    reduceInGameNightPrivateResult(
      { gameId: "g1", dayIndex: 2, actionType: "CONFIRM", targetId: "u-unknown", role: "DOCTOR" },
      PLAYERS,
    ),
    null,
  )
})

// [테스트 이름, payload, players] — 전부 null이 나와야 하는 입력이다.
const rejectedCases = [
  ["payload가 null", null, PLAYERS],
  ["payload가 undefined", undefined, PLAYERS],
  ["payload가 배열", [{ actionType: "CONFIRM" }], PLAYERS],
  ["players가 배열이 아님", { actionType: "CONFIRM", targetId: "u-target", role: "DOCTOR" }, null],
  ["알 수 없는 actionType", { actionType: "KILL", targetId: "u-target", role: "JOKER" }, PLAYERS],
  ["targetId가 빈 문자열", { actionType: "CONFIRM", targetId: "", role: "DOCTOR" }, PLAYERS],
  ["targetId가 문자열이 아님", { actionType: "CONFIRM", targetId: 7, role: "DOCTOR" }, PLAYERS],
  [
    "INVESTIGATE인데 team 자리에 role 값이 옴",
    { actionType: "INVESTIGATE", targetId: "u-target", team: "DOCTOR" },
    PLAYERS,
  ],
  ["INVESTIGATE인데 team이 없음", { actionType: "INVESTIGATE", targetId: "u-target" }, PLAYERS],
  ["CONFIRM인데 알 수 없는 role", { actionType: "CONFIRM", targetId: "u-target", role: "UNKNOWN" }, PLAYERS],
  ["대상 닉네임이 비어 있음", { actionType: "CONFIRM", targetId: "u-nameless", role: "DOCTOR" }, PLAYERS],
]

for (const [name, payload, players] of rejectedCases) {
  test(`거부: ${name} → null`, () => {
    assert.equal(reduceInGameNightPrivateResult(payload, players), null)
  })
}

test("입력을 변형하지 않는 순수 함수다", () => {
  const payload = { gameId: "g1", dayIndex: 1, actionType: "INVESTIGATE", targetId: "u-target", team: "JOKER" }
  const payloadSnapshot = structuredClone(payload)
  const playersSnapshot = structuredClone(PLAYERS)

  reduceInGameNightPrivateResult(payload, PLAYERS)

  assert.deepEqual(payload, payloadSnapshot)
  assert.deepEqual(PLAYERS, playersSnapshot)
})
