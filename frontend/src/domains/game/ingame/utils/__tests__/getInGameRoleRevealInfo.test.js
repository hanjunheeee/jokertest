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
