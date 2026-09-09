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

// ---------------------------------------------------------------------------
// AC-02 · 보호 결과 계약과 "같은 역할인 타인의 결과"의 서버 근거.
//
// 아래 세 시험의 기대값은 전부 로컬 backend game-core/gameSession.js prepareNightResolution의
// 실제 생성 규칙에서 유도했다(추측한 계약이 아니다):
//   - privateResultBuilderByRole은 역할 단위로 결과를 하나 만들고(1514-1539행),
//     그 역할의 "생존" 보유자 전원에게 값이 같은 사본을 나눠 준다(1542-1547행).
//   - DOCTOR/CITIZEN은 이 Map에 아예 등장하지 않는다(1432-1433행 계약 주석).
//   - 자기 자신을 지목할 수 있는 역할은 DOCTOR뿐이다(SELF_TARGET_ALLOWED_ROLES, 1297행).
// ---------------------------------------------------------------------------

test("AC-02: 보호 결과 — 의사에게는 개인 결과가 없고, 보호가 관측되는 통지는 암살 실패 하나뿐이다", () => {
  // 서버는 DOCTOR를 privateResults에 넣지 않는다 — 어떤 형태로 위조해 와도 저장되지 않는다.
  assert.equal(parseAs("DOCTOR", { ...GUARD_INVESTIGATE, actionType: "PROTECT" }), null)
  assert.equal(parseAs("DOCTOR", { ...GUARD_INVESTIGATE, actionType: "PROTECT", role: "JOKER" }), null)
  assert.equal(parseAs("DOCTOR", JOKER_ASSASSINATION_FAILED), null)
  assert.equal(parseAs("DOCTOR", GUARD_INVESTIGATE), null)

  // 보호의 결과는 "보호받았다"가 아니라 "보호로 암살이 막혔다"로만, 그것도 생존 JOKER에게만
  // 관측된다. 그 통지가 곧 이 계약에서 보호 결과의 전부다.
  const parsed = parseAs("JOKER", JOKER_ASSASSINATION_FAILED)
  const display = reduceInGameNightPrivateResult(parsed, PLAYERS)
  assert.equal(display.kind, "ASSASSINATE")
  assert.equal(display.label, INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL)
  // 보호자·보호자 역할·대상은 payload에도 저장값에도 표시에도 없다(buildAssassinationFailureNotice).
  assert.equal(parsed.targetId, null)
  assert.equal(parsed.role, null)
})

test("AC-02: 같은 역할인 타인의 결과는 내 결과와 필드가 같다 — 구별할 값의 차이 자체가 없다", () => {
  // 경비원이 둘인 밤: 서버는 조사 결과를 역할 단위로 한 번 만들어(privateResultBuilderByRole)
  // 생존 경비원 전원에게 값이 같은 사본으로 배달한다. 그래서 "다른 경비원이 받은 payload"는
  // 내가 받은 payload와 필드 단위로 동일하다.
  const mine = { ...GUARD_INVESTIGATE }
  const theirs = { ...GUARD_INVESTIGATE }
  assert.deepEqual(mine, theirs, "이 시험의 전제 — 같은 역할의 결과는 값이 같다")
  assert.deepEqual(parseAs("GUARD", mine), parseAs("GUARD", theirs))

  // 구별이 실제로 가능한 축은 "내가 그 결과를 받을 수 있는 수신자인가" 셋뿐이고, 셋 다 막는다.
  //  1) 역할이 다르다 — 위 "타인 결과는 저장하지 않는다" 시험.
  //  2) 내가 이미 죽었다 — 서버는 사망자에게 개인 결과를 만들지 않는다.
  assert.equal(parseAs("GUARD", GUARD_INVESTIGATE, { selfAlive: false }), null)
  //  3) 대상이 나다 — 자기 지목이 허용되는 역할은 DOCTOR뿐이고 DOCTOR는 개인 결과를 받지 않는다.
  assert.equal(parseAs("GUARD", GUARD_INVESTIGATE, { selfUuid: "uuid-target" }), null)
  assert.equal(
    parseAs("WITCH_HUNTER", WITCH_HUNTER_CONFIRM, { selfUuid: "uuid-target" }),
    null,
    "확인 결과의 대상도 본인일 수 없다",
  )
})

test("AC-02: 생존을 아직 모르면(roster 미도착) 거부하지 않는다 — 내 결과를 영구히 잃지 않기 위해", () => {
  // selectInGameSelfAlive는 roster가 없거나 alive가 없으면 null("모름")을 준다. 그 순간에
  // 도착한 내 결과까지 버리면 다시 받을 방법이 없다(1회성 개별 emit이다).
  assert.notEqual(parseAs("GUARD", GUARD_INVESTIGATE, { selfAlive: null }), null)
  assert.notEqual(parseAs("GUARD", GUARD_INVESTIGATE, { selfAlive: true }), null)
  // 본인 uuid를 모르면 대상 비교를 건너뛴다(역할·생존 검사는 그대로 적용된다).
  assert.notEqual(parseAs("GUARD", GUARD_INVESTIGATE, { selfUuid: null }), null)
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
