import test from "node:test"
import assert from "node:assert/strict"
import {
  INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL,
  parseInGameNightPrivateResultPayload,
  reduceInGameNightPrivateResult,
} from "../reduceInGameNightPrivateResult.js"

// 아래 payload 표본은 로컬 backend/socket/gameSession.js handleResolveNight이 실제로 보내는
// 세 가지 형태 그대로다(gameId·dayIndex + game-core prepareNightResolution의 privateResult).
const GAME_ID = "game-npr-1"
const DAY_INDEX = 1

const GUARD_INVESTIGATE = Object.freeze({
  gameId: GAME_ID,
  dayIndex: DAY_INDEX,
  actionType: "INVESTIGATE",
  targetId: "uuid-target",
  role: "JOKER",
})

const WITCH_HUNTER_CONFIRM = Object.freeze({
  gameId: GAME_ID,
  dayIndex: DAY_INDEX,
  actionType: "CONFIRM",
  targetId: "uuid-target",
  role: "DOCTOR",
})

const JOKER_ASSASSINATION_FAILED = Object.freeze({
  gameId: GAME_ID,
  dayIndex: DAY_INDEX,
  actionType: "ASSASSINATE",
  success: false,
})

const PLAYERS = Object.freeze([
  Object.freeze({ uuid: "uuid-self", nickname: "나" }),
  Object.freeze({ uuid: "uuid-target", nickname: "상대" }),
])

function parseAs(selfRole, payload, overrides = {}) {
  return parseInGameNightPrivateResultPayload({
    payload,
    gameId: GAME_ID,
    dayIndex: DAY_INDEX,
    phase: "NIGHT",
    selfRole,
    ...overrides,
  })
}

test("AC-02: 경비원의 조사 결과 payload가 대상 닉네임과 역할 문구가 된다", () => {
  const parsed = parseAs("GUARD", GUARD_INVESTIGATE)
  assert.notEqual(parsed, null)

  const display = reduceInGameNightPrivateResult(parsed, PLAYERS)
  assert.deepEqual(display, {
    kind: "INVESTIGATE",
    targetNickname: "상대",
    label: "조사 결과, 상대 님의 역할은 광대입니다.",
  })
})

test("AC-02: 마녀사냥꾼의 확인 결과도 같은 표기 사전을 쓴다", () => {
  const parsed = parseAs("WITCH_HUNTER", WITCH_HUNTER_CONFIRM)
  const display = reduceInGameNightPrivateResult(parsed, PLAYERS)
  assert.deepEqual(display, {
    kind: "CONFIRM",
    targetNickname: "상대",
    label: "확인 결과, 상대 님의 역할은 의사입니다.",
  })
})

test("AC-02: 보호로 막힌 암살 통지는 보호자·대상·사유 없이 실패 사실만 문구로 만든다", () => {
  const parsed = parseAs("JOKER", JOKER_ASSASSINATION_FAILED)
  assert.notEqual(parsed, null)
  assert.equal(parsed.targetId, null, "대상은 payload에도 저장값에도 없다")

  const display = reduceInGameNightPrivateResult(parsed, PLAYERS)
  assert.deepEqual(display, {
    kind: "ASSASSINATE",
    targetNickname: null,
    label: INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL,
  })
  assert.equal(/보호|의사/.test(display.label), false, "누가 막았는지는 문구에 없다")
})

test("AC-02: 타인 결과는 저장하지 않는다 — 본인 역할이 그 결과의 수신 자격이 아니면 전부 거부", () => {
  // 시민·의사에게는 어떤 개인 결과도 오지 않는다.
  for (const selfRole of ["CITIZEN", "DOCTOR"]) {
    assert.equal(parseAs(selfRole, GUARD_INVESTIGATE), null, `${selfRole}에게 조사 결과가 저장됐다`)
    assert.equal(parseAs(selfRole, WITCH_HUNTER_CONFIRM), null, `${selfRole}에게 확인 결과가 저장됐다`)
    assert.equal(parseAs(selfRole, JOKER_ASSASSINATION_FAILED), null, `${selfRole}에게 암살 통지가 저장됐다`)
  }

  // 역할이 있어도 자기 것이 아닌 종류는 거부한다(경비원에게 온 확인·암살 결과 등).
  assert.equal(parseAs("GUARD", WITCH_HUNTER_CONFIRM), null)
  assert.equal(parseAs("GUARD", JOKER_ASSASSINATION_FAILED), null)
  assert.equal(parseAs("WITCH_HUNTER", GUARD_INVESTIGATE), null)
  assert.equal(parseAs("JOKER", GUARD_INVESTIGATE), null)

  // 본인 역할을 아직 모르면(스냅샷 이전 등) 아무것도 저장하지 않는다(fail-closed).
  assert.equal(parseAs(null, GUARD_INVESTIGATE), null)
})

test("AC-02: 다른 게임·다른 밤·밤이 아닌 phase의 결과는 저장하지 않는다", () => {
  assert.equal(parseAs("GUARD", { ...GUARD_INVESTIGATE, gameId: "game-other" }), null)
  assert.equal(parseAs("GUARD", { ...GUARD_INVESTIGATE, dayIndex: DAY_INDEX + 1 }), null)
  assert.equal(parseAs("GUARD", GUARD_INVESTIGATE, { phase: "DAY" }), null)
  assert.equal(parseAs("GUARD", GUARD_INVESTIGATE, { gameId: null }), null)
  assert.equal(parseAs("GUARD", GUARD_INVESTIGATE, { dayIndex: null }), null)
})

test("AC-02: 형태가 어긋난 payload는 전부 거부한다", () => {
  assert.equal(parseAs("GUARD", null), null)
  assert.equal(parseAs("GUARD", []), null)
  assert.equal(parseAs("GUARD", { ...GUARD_INVESTIGATE, actionType: "PROTECT" }), null)
  assert.equal(parseAs("GUARD", { ...GUARD_INVESTIGATE, targetId: "" }), null)
  assert.equal(parseAs("GUARD", { ...GUARD_INVESTIGATE, role: "MAYOR" }), null)
  // 성공한 암살은 공개 사망으로만 알려진다 — 개인 통지로 오는 success:true는 없다.
  assert.equal(parseAs("JOKER", { ...JOKER_ASSASSINATION_FAILED, success: true }), null)
})

test("AC-02: 저장된 값은 원본 payload와 분리된 새 객체다(호출부 변형이 store로 새지 않는다)", () => {
  const payload = { ...GUARD_INVESTIGATE }
  const parsed = parseAs("GUARD", payload)
  payload.targetId = "uuid-self"
  payload.role = "CITIZEN"

  assert.equal(parsed.targetId, "uuid-target")
  assert.equal(parsed.role, "JOKER")
})

test("대상을 roster에서 찾지 못하면 uuid를 대신 보여주지 않고 표시를 포기한다", () => {
  const parsed = parseAs("GUARD", GUARD_INVESTIGATE)
  assert.equal(reduceInGameNightPrivateResult(parsed, []), null)
  assert.equal(
    reduceInGameNightPrivateResult(parsed, [{ uuid: "uuid-target", nickname: "" }]),
    null,
    "닉네임이 비어 있으면 uuid로 대체하지 않는다",
  )
  assert.equal(reduceInGameNightPrivateResult(parsed, null), null)
  assert.equal(reduceInGameNightPrivateResult(null, PLAYERS), null)
})
