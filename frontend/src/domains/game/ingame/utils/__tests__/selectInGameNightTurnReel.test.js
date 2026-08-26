import test from "node:test"
import assert from "node:assert/strict"

import {
  computeInGameNightTurnReelBarrier,
  selectInGameNightTurnReel,
} from "../selectInGameNightTurnReel.js"
import { buildInGameNightTurnReel } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"

/**
 * 밤 연출 릴 파생 — 이 파일이 지키는 계약은 두 축이다.
 *
 * 구성(selectInGameNightTurnReel): **릴은 역할 보유자의 생사를 보지 않는다.** 죽은 역할의 칸이
 * 사라지면 "안내가 사라짐 = 그 역할 사망"으로 사망자의 역할이 누출된다. 유일한 예외는
 * 마녀사냥꾼의 "시신이 없는 밤에는 턴 없음"이며, 그것도 roster 전체의 사망자 존재 여부(이미
 * 공개 정보)만 보고 마녀사냥꾼 보유자 본인의 생사는 보지 않는다.
 *
 * 전진(computeInGameNightTurnReelBarrier): 커서는 canonical 역할 턴이 놓인 칸을 넘지 못한다 —
 * 보유자가 살아있는 역할의 칸은 그 역할의 제출로 canonical이 움직이기 전까지 멈춘다.
 */
const ALL_ROLES = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]

function buildState({ phase = "NIGHT", dayIndex = 1, nightTurnRoles, players } = {}) {
  return {
    id: "game-reel",
    phase,
    dayIndex,
    players: players ?? [
      { uuid: "p1", nickname: "P1", alive: true },
      { uuid: "p2", nickname: "P2", alive: true },
    ],
    ...(nightTurnRoles === undefined ? {} : { nightTurnRoles }),
  }
}

/** 지정한 uuid만 사망한 roster. */
function rosterWithDead(deadUuids) {
  return [
    { uuid: "p1", nickname: "P1", alive: !deadUuids.includes("p1") },
    { uuid: "p2", nickname: "P2", alive: !deadUuids.includes("p2") },
  ]
}

test("구성에 있는 역할만 canonical 순서로 담고 그 외 역할은 빠진다", () => {
  assert.deepEqual(
    selectInGameNightTurnReel(buildState({ nightTurnRoles: ["GUARD", "JOKER"] })),
    ["JOKER", "GUARD"],
    "입력 순서가 아니라 광대→의사→경호원→마녀사냥꾼 고정 순서다",
  )
  assert.deepEqual(selectInGameNightTurnReel(buildState({ nightTurnRoles: ["CITIZEN"] })), [])
})

test("경호원 보유자가 전원 사망해도 릴에 경호원 칸이 그대로 남는다", () => {
  const composition = ["JOKER", "DOCTOR", "GUARD"]
  const aliveNight = selectInGameNightTurnReel(buildState({ nightTurnRoles: composition }))

  // roster에 사망자가 생겨도(그가 경호원 보유자였는지는 프런트가 알 수 없다) 릴은 그대로다.
  const deadNight = selectInGameNightTurnReel(
    buildState({ nightTurnRoles: composition, dayIndex: 2, players: rosterWithDead(["p2"]) }),
  )

  assert.deepEqual(aliveNight, ["JOKER", "DOCTOR", "GUARD"])
  assert.deepEqual(deadNight, ["JOKER", "DOCTOR", "GUARD"], "생사는 릴의 입력이 아니다")
})

test("마녀사냥꾼 칸은 시신이 있는 밤에만 들어온다 — 보유자가 죽었어도 시신이 있으면 들어온다", () => {
  // 시신이 없는 밤: 원래 규칙대로 마녀사냥꾼 턴 자체가 없다.
  assert.deepEqual(selectInGameNightTurnReel(buildState({ nightTurnRoles: ALL_ROLES })), [
    "JOKER",
    "DOCTOR",
    "GUARD",
  ])

  // 시신이 생긴 밤: 누가 죽었든(마녀사냥꾼 보유자여도) 마녀사냥꾼 칸이 들어온다.
  assert.deepEqual(
    selectInGameNightTurnReel(
      buildState({ nightTurnRoles: ALL_ROLES, dayIndex: 2, players: rosterWithDead(["p1"]) }),
    ),
    ALL_ROLES,
  )
})

test("NIGHT가 아니거나 dayIndex가 유효하지 않으면 빈 배열이다", () => {
  for (const phase of ["ROLE_REVEAL", "DAY", "TRIBUNAL", "ENDED", "SOMETHING_ELSE"]) {
    assert.deepEqual(selectInGameNightTurnReel(buildState({ phase })), [])
  }
  assert.deepEqual(selectInGameNightTurnReel(buildState({ dayIndex: -1 })), [])
  assert.deepEqual(selectInGameNightTurnReel(buildState({ dayIndex: 1.5 })), [])
  assert.deepEqual(selectInGameNightTurnReel({ phase: "NIGHT" }), [])
})

test("state가 아닌 입력에도 throw 없이 빈 배열이다", () => {
  for (const input of [null, undefined, 0, "NIGHT", [], [{ phase: "NIGHT" }]]) {
    assert.deepEqual(selectInGameNightTurnReel(input), [])
  }
})

test("nightTurnRoles가 없으면(구버전 세션) 네 역할 전체를 후보로 삼는다 — 시신 조건은 그대로다", () => {
  // "구성을 모르면 덜 감추지 말고 더 재생한다"가 안전한 기본값이다(누출을 만들지 않는다).
  assert.deepEqual(selectInGameNightTurnReel(buildState({ nightTurnRoles: undefined })), [
    "JOKER",
    "DOCTOR",
    "GUARD",
  ])
  assert.deepEqual(
    selectInGameNightTurnReel(
      buildState({ nightTurnRoles: undefined, dayIndex: 2, players: rosterWithDead(["p2"]) }),
    ),
    ALL_ROLES,
  )
  // 빈 배열·비배열도 같은 폴백으로 취급한다.
  assert.deepEqual(selectInGameNightTurnReel(buildState({ nightTurnRoles: [] })), [
    "JOKER",
    "DOCTOR",
    "GUARD",
  ])
  assert.deepEqual(selectInGameNightTurnReel(buildState({ nightTurnRoles: "GUARD" })), [
    "JOKER",
    "DOCTOR",
    "GUARD",
  ])
})

test("buildInGameNightTurnReel은 dayIndex가 유효하지 않으면 빈 배열이고, hasDeadPlayer 기본값은 false다", () => {
  assert.deepEqual(buildInGameNightTurnReel(ALL_ROLES, -1, { hasDeadPlayer: true }), [])
  assert.deepEqual(buildInGameNightTurnReel(ALL_ROLES, 1.5), [])
  assert.deepEqual(buildInGameNightTurnReel(ALL_ROLES, 0), ["JOKER", "DOCTOR", "GUARD"])
  assert.deepEqual(buildInGameNightTurnReel(ALL_ROLES, 0, { hasDeadPlayer: true }), ALL_ROLES)
})

test("상한은 canonical 역할 턴이 릴에서 차지한 칸이다", () => {
  const reel = ["JOKER", "DOCTOR", "GUARD"]
  assert.equal(computeInGameNightTurnReelBarrier(reel, "JOKER"), 0)
  assert.equal(computeInGameNightTurnReelBarrier(reel, "DOCTOR"), 1)
  assert.equal(computeInGameNightTurnReelBarrier(reel, "GUARD"), 2)
})

test("canonical 역할이 릴에 없으면 마지막 칸을 상한으로 삼는다(진행 불능 없음)", () => {
  const reel = ["JOKER", "DOCTOR", "GUARD"]
  // 구성·시신 판단이 서버와 잠깐 어긋난 창이다. 상한을 못 찾았다고 커서를 0에 얼려두면 그 밤
  // 내내 상태바가 첫 역할에 갇히므로, "예전처럼 흘러감"이 더 안전한 열화다.
  assert.equal(computeInGameNightTurnReelBarrier(reel, "WITCH_HUNTER"), 2)
  assert.equal(computeInGameNightTurnReelBarrier(reel, null), 2)
  assert.equal(computeInGameNightTurnReelBarrier(reel, undefined), 2)
  assert.equal(computeInGameNightTurnReelBarrier(reel, ""), 2)
  assert.equal(computeInGameNightTurnReelBarrier(reel, 3), 2)
})

test("릴이 비었거나 배열이 아니면 상한은 0이다(throw 없음)", () => {
  for (const input of [[], null, undefined, "JOKER", 0, { 0: "JOKER" }]) {
    assert.equal(computeInGameNightTurnReelBarrier(input, "JOKER"), 0)
  }
  assert.equal(computeInGameNightTurnReelBarrier(["JOKER"], "JOKER"), 0)
})
