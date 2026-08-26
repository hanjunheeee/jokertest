import test from "node:test"
import assert from "node:assert/strict"
import { getInGameRoleRevealInfo } from "../getInGameRoleRevealInfo.js"

const AUTH_UUID = "player-1"

function buildSelf(overrides = {}) {
  return {
    uuid: AUTH_UUID,
    nickname: "Alice",
    role: "CITIZEN",
    team: "CITIZEN",
    ...overrides,
  }
}

test("getInGameRoleRevealInfo: self가 없으면 null이다(역할 데이터 없음 => 공개 없음)", () => {
  assert.equal(getInGameRoleRevealInfo(null, { authUuid: AUTH_UUID }), null)
  assert.equal(getInGameRoleRevealInfo(undefined, { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: authUuid가 없으면 null이다", () => {
  assert.equal(getInGameRoleRevealInfo(buildSelf(), {}), null)
  assert.equal(getInGameRoleRevealInfo(buildSelf(), { authUuid: null }), null)
})

test("getInGameRoleRevealInfo: self.uuid가 authUuid와 다르면 null이다(이전 계정/다른 게임의 stale self)", () => {
  const self = buildSelf({ uuid: "other-uuid" })
  assert.equal(getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: nickname이 비어있으면 null이다", () => {
  assert.equal(getInGameRoleRevealInfo(buildSelf({ nickname: "" }), { authUuid: AUTH_UUID }), null)
  assert.equal(getInGameRoleRevealInfo(buildSelf({ nickname: "   " }), { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: 알 수 없는 role이면 null이다", () => {
  assert.equal(getInGameRoleRevealInfo(buildSelf({ role: "UNKNOWN" }), { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: role과 team 조합이 어긋나면 null이다", () => {
  assert.equal(
    getInGameRoleRevealInfo(buildSelf({ role: "JOKER", team: "CITIZEN" }), { authUuid: AUTH_UUID }),
    null,
  )
})

test("getInGameRoleRevealInfo: 유효한 CITIZEN self는 allies 없이 완전한 표시 정보를 반환한다", () => {
  const result = getInGameRoleRevealInfo(buildSelf(), { authUuid: AUTH_UUID })
  assert.ok(result)
  assert.equal(result.uuid, AUTH_UUID)
  assert.equal(result.nickname, "Alice")
  assert.equal(result.role, "CITIZEN")
  assert.equal(typeof result.roleName, "string")
  assert.equal(typeof result.teamLabel, "string")
  assert.equal(typeof result.description, "string")
  assert.equal(result.allies, null)
})

test("getInGameRoleRevealInfo: 유효한 JOKER self는 allies 배열을 그대로 반환한다", () => {
  const self = buildSelf({ role: "JOKER", team: "JOKER", allies: ["ally-1", "ally-2"] })
  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
  assert.ok(result)
  assert.deepEqual(result.allies, ["ally-1", "ally-2"])
})

test("getInGameRoleRevealInfo: JOKER인데 allies가 배열이 아니면 null이다(오염된 payload 방어)", () => {
  const self = buildSelf({ role: "JOKER", team: "JOKER", allies: "not-an-array" })
  assert.equal(getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: CITIZEN 등 비-JOKER는 allies 필드가 섞여 들어와도 절대 노출하지 않는다", () => {
  const self = buildSelf({ role: "CITIZEN", team: "CITIZEN", allies: ["should-not-leak"] })
  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
  assert.ok(result)
  assert.equal(result.allies, null)
})

test("getInGameRoleRevealInfo: 각 역할은 서로 다른 roleName/description을 가진다(빈 값이 아님)", () => {
  const roles = ["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]
  const names = new Set()
  for (const role of roles) {
    const team = role === "JOKER" ? "JOKER" : "CITIZEN"
    const self = buildSelf({ role, team, ...(role === "JOKER" ? { allies: [] } : {}) })
    const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
    assert.ok(result, `role=${role}`)
    assert.ok(result.roleName.length > 0, `role=${role}`)
    assert.ok(result.description.length > 0, `role=${role}`)
    names.add(result.roleName)
  }
  assert.equal(names.size, roles.length, "역할별 roleName은 서로 달라야 한다")
})

test("getInGameRoleRevealInfo: WITCH_HUNTER 설명은 '죽은 사람을 지목해 그 직업을 알아냅니다.'다", () => {
  const self = buildSelf({ role: "WITCH_HUNTER", team: "CITIZEN" })
  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
  assert.ok(result)
  assert.equal(result.roleName, "마녀사냥꾼")
  assert.equal(result.description, "죽은 사람을 지목해 그 직업을 알아냅니다.")
  assert.equal(result.description.includes("둘째 날 밤부터"), false)
})

test("getInGameRoleRevealInfo: 나머지 네 역할의 설명 문구는 이번 변경에 흔들리지 않는다", () => {
  const expected = [
    ["JOKER", "JOKER", "밤마다 한 명을 지목해 처치할 수 있습니다. 낮에는 정체를 들키지 않도록 시민인 척 행동하세요."],
    ["CITIZEN", "CITIZEN", "특별한 능력은 없습니다. 낮 토론과 투표로 광대를 찾아내야 합니다."],
    ["DOCTOR", "CITIZEN", "밤마다 한 명을 지목해 광대의 공격으로부터 보호할 수 있습니다."],
    ["GUARD", "CITIZEN", "밤마다 한 명을 지목해 정체(광대 여부)를 조사할 수 있습니다."],
  ]
  for (const [role, team, description] of expected) {
    const self = buildSelf({ role, team, ...(role === "JOKER" ? { allies: [] } : {}) })
    const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
    assert.ok(result, `role=${role}`)
    assert.equal(result.description, description, `role=${role}`)
  }
})
